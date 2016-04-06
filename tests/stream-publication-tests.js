import {DirectStreamPublication} from 'meteor/okland:batch-publication';

var sampleItemsOriginalSubscriptionName = 'streamPublication.sampleItemsOriginal';
var sampleItemsSubscriptionName = 'streamPublication.sampleItems';
var sampleItemsOriginalCollection = new Meteor.Collection(sampleItemsOriginalSubscriptionName);
var expectedCount = 10;
var serverLog = new UnitTestLogger('batch-publication-streams');

if (Meteor.isServer) {
  var initCollection = function() {
    sampleItemsOriginalCollection.remove({});
    // Add base data
    if (sampleItemsOriginalCollection.find().count() < 1) {
      _.each(_.range(0, expectedCount), function (i) {
        sampleItemsOriginalCollection.insert({
          title: `item num ${i}`,
          description: `description number ${i}`
        });
      });
    }
  };

  initCollection();

  Meteor.publish(sampleItemsSubscriptionName, function () {
    // TODO add user validation
    DirectStreamPublication(process.env.ROOT_URL, sampleItemsOriginalSubscriptionName, arguments, this, sampleItemsSubscriptionName);
  });

  Meteor.publish(sampleItemsOriginalSubscriptionName, function () {
    // TODO add user validation
    return sampleItemsOriginalCollection.find();
  });

}
if (Meteor.isClient) {

  Tinytest.addAsync('Stream Publication - Verify original subscription works', function (assert, onComplete) {
    var subscription = Meteor.subscribe.call(Meteor, sampleItemsOriginalSubscriptionName, 'sampleData', function() {
      var countSampleItems = sampleItemsOriginalCollection.find().count();
      assert.equal(countSampleItems , expectedCount, `Expected to get ${expectedCount} sample original items got: ${countSampleItems}`);
      subscription && subscription.stop();
      serverLog.log('End verify original subscription works test', function() {
        var countSampleItems = sampleItemsOriginalCollection.find().count();
        assert.equal(countSampleItems , 0, `Expected to get 0 sample original items after unsubscribe, got: ${countSampleItems}`);
        onComplete();
      });
    });
  });

  var sampleItemsCollection = new Meteor.Collection(sampleItemsSubscriptionName);
  Tinytest.addAsync('Stream Publication - Verify stream subscription works', function (assert, onComplete) {
    var subscription = Meteor.subscribe.call(Meteor, sampleItemsSubscriptionName, 'sampleData', function() {
      var countSampleItems = sampleItemsCollection.find().count();
      assert.equal(countSampleItems , expectedCount, `Expected to get ${expectedCount} sample items got: ${countSampleItems}`);
      subscription && subscription.stop();
      serverLog.log('End verify stream subscription works test', function() {
        var countSampleItems = sampleItemsCollection.find().count();
        // After unsubscribe data should still exist in connection - Not sending remove.
        // Client should note that ttl of items is on him after unsubscribe.
        assert.equal(countSampleItems ,expectedCount, `Expected to get ${expectedCount} sample items after unsubscribe, got: ${countSampleItems}`);
        onComplete();
      });
    });
  });
}

