// TODO add cache and update batch support, subscription redirect
import {DDP} from 'meteor/ddp-client';
import StreamStore from './stream-store';
/**
 * Stream Publication class allow to stream publication
 * @param fromUrl
 * @param subName
 * @param pub
 * @constructor
 */
export var StreamPublication = function (fromUrl, subName, subArguments, pub) {
  this.fromUrl = fromUrl;
  this.subName = subName;
  this.pub = pub;

  this.connection = DDP.connect(fromUrl);
  // Use stream store instead of MongoCollection or LocalCollection
  this.connection._stores[subName] = new StreamStore(pub);

  var subscription = this.connection.subscribe(this.subName, ...subArguments, function () {
    pub.ready();
  });


  pub.onStop(function () {
    subscription && subscription.stop();
  });
};

// TODO add cache and update batch support, subscription redirect
/**
 * Direct stream one publication to another
 * @param fromUrl
 * @param subName
 * @param subArguments
 * @param pub
 * @param collectionName
 * @constructor
 */
export var DirectStreamPublication = function (fromUrl, subName, subArguments, pub, collectionName) {
  var session = pub._session;
  var pubCallbacks = {
    stopCallback: [],
    added: function (id, fields) {
      session.sendAdded(collectionName, id, fields);
    },
    changed: function (id, fields) {
      session.sendChanged(collectionName, id, fields);
    },
    removed: function (id) {
      session.sendRemoved(collectionName, id);
    },
    ready: function () {
      pub.ready();
    },
    onStop: function (cb) {
      this.stopCallback.push(cb);
    }
  };

  pub.onStop(function () {
    pubCallbacks.stopCallback.forEach(function (cb) {
      cb();
    });
  });

  StreamPublication(fromUrl, subName, subArguments, pubCallbacks);
};


