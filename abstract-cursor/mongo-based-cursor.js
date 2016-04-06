import AbstractCursor from './abstract-cursor.js';
import {Minimongo, LocalCollection} from 'meteor/minimongo';
import {_} from 'meteor/underscore';

/**
 * An cursor representing a mongo cursor
 */
class MongoBasedCursorClass extends AbstractCursor {
  constructor(cursor) {
    super();
    this.cursor = cursor;

    // This is similar to the meteor mongo driver unique identifier of the observe multiplexer
    this.observerKey = JSON.stringify(
      _.extend({ordered: this.ordered}, cursor._cursorDescription)
    );
  }

  observeChanges(callbacks) {
    this.handle = this.cursor.observeChanges(callbacks);
    return {
      stop : this.stop
    };
  }

  getCache() {
    var multiplexer = this.cursor._mongo.
      _observeMultiplexers[this.observerKey];

    return multiplexer && multiplexer._cache &&
      multiplexer._cache.docs;
  }

  stop() {
    this.handle && this.handle.stop();
  }

  isUsingOplog() {
    var self = this,
      cursorDescription = self.cursor._cursorDescription,
      mongoConnection = self.cursor._mongo,
      matcher, sorter;

    return _.all([
      function () {
        // At a bare minimum, using the oplog requires us to have an oplog, to
        // want unordered callbacks, and to not want a callback on the polls
        // that won't happen.
        return mongoConnection._oplogHandle && !self.ordered;
      }, function () {
        // We need to be able to compile the selector. Fall back to polling for
        // some newfangled $selector that minimongo doesn't support yet.
        try {
          matcher = new Minimongo.Matcher(cursorDescription.selector);
          return true;
        } catch (e) {
          // XXX make all compilation errors MinimongoError or something
          //     so that this doesn't ignore unrelated exceptions
          return false;
        }
      }, function () {
        // ... and the selector itself needs to support oplog.
        //return OplogObserveDriver.cursorSupported(cursorDescription, matcher);
        // First, check the options.
        var options = cursorDescription.options;

        // Did the user say no explicitly?
        if (options._disableOplog)
          return false;

        // skip is not supported: to support it we would need to keep track of all
        // "skipped" documents or at least their ids.
        // limit w/o a sort specifier is not supported: current implementation needs a
        // deterministic way to order documents.
        if (options.skip || (options.limit && !options.sort)) return false;

        // If a fields projection option is given check if it is supported by
        // minimongo (some operators are not supported).
        if (options.fields) {
          try {
            LocalCollection._checkSupportedProjection(options.fields);
          } catch (e) {
            if (e.name === "MinimongoError")
              return false;
            else
              throw e;
          }
        }

        // We don't allow the following selectors:
        //   - $where (not confident that we provide the same JS environment
        //             as Mongo, and can yield!)
        //   - $near (has "interesting" properties in MongoDB, like the possibility
        //            of returning an ID multiple times, though even polling maybe
        //            have a bug there)
        //           XXX: once we support it, we would need to think more on how we
        //           initialize the comparators when we create the driver.
        return !matcher.hasWhere() && !matcher.hasGeoQuery();
      }, function () {
        // And we need to be able to compile the sort, if any.  eg, can't be
        // {$natural: 1}.
        if (!cursorDescription.options.sort)
          return true;
        try {
          sorter = new Minimongo.Sorter(cursorDescription.options.sort,
            {matcher: matcher});
          return true;
        } catch (e) {
          // XXX make all compilation errors MinimongoError or something
          //     so that this doesn't ignore unrelated exceptions
          return false;
        }
      }], function (f) {
      return f();
    });
  }
}

var MongoBasedCursor = MongoBasedCursorClass;
export default MongoBasedCursor;
