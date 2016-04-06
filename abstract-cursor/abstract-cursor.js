import {Meteor} from 'meteor/meteor';

// An interface for cursor
class AbstractCursorClass {
  constructor() {
    // TODO: Handle ordered true - need to think in which case we would like to do this.
    this.ordered = false;
  }

  observeChanges(callbacks) {
    throw new Meteor.Error('AbstractCursor.observeChanges needed to be implemented by inherited class');

    // Should return something like ...
    //return {
    //  stop : this.stop
    //};
  }

  /**
   * Get current state of cursor cache
   * @returns {{forEach: AbstractCursorClass.forEachIterator}}
   */
  getCache() {
    throw new Meteor.Error('AbstractCursor.getCache needed to be implemented by inherited class');

    // Something like
    //return {
    //  forEach: AbstractCursorClass.forEachIterator
    //};
  }

  /**
   * Stop the observe changes and clean all cursor memory.
   */
  stop() {
    throw new Meteor.Error('AbstractCursor.stop needed to be implemented by inherited class');
  }

  /**
   * Returns whether the cursor is using oplog
   * This function helps to decide which callbacks the observeChanges should be given.
   * @returns {boolean}
   */
  isUsingOplog() {
    throw new Meteor.Error('AbstractCursor.isUsingOplog needed to be implemented by inherited class');

    // Something like
    //return true;
  }

  static forEachIterator(obj, iterator) {
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var breakIfFalse = iterator.call(null, obj[keys[i]], keys[i]);
      if (breakIfFalse === false) {
        return;
      }
    }
  }
}

var AbstractCursor = AbstractCursorClass;
export default AbstractCursor;
