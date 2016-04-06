import SubscriptionsBatch from './subscription_batch.js';
import {Meteor} from 'meteor/meteor';
import debugLog from './debug.js';

Meteor.publishBatchComposite = function (name, options) {
  return Meteor.publish(name, Meteor.innerPublishCompositeBatch(name, options));
};

Meteor.innerPublishCompositeBatch = function(name, options) {
  return function () {
    this.unblock && this.unblock();

    var self = this;
    var args = Array.prototype.slice.apply(arguments);

    var publishKey = SubscriptionsBatch.getKey(name, options, args);
    // Here we could check if can't handle publication - should redirect to other server -> if server has this ability. not supported in this version.

    var subscription = SubscriptionsBatch.getOrCreate(this, name, options, args, publishKey);

    this.onStop(function () {
      subscription.stopPublication(self);
    });

    this.ready();
  };
};

Meteor.publishBatchComposite.enableDebugLogging = function () {
  debugLog.prototype.enableDebugLogging();
};

export {Meteor};

