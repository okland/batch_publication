/**
 * Define test helper
 */
var testPublication = function (testName, options) {
  options.args = options.args || [];

  Tinytest.addAsync(testName, function (assert, onComplete) {
    var subscription;
    var args = [options.publication].concat(options.args);

    args.push(function onSubscriptionReady() {
      serverLog.log('Sub ready, starting test', function () {
        options.testHandler(assert, function () {
          serverLog.log('stopping sub', function () {
            subscription.stop && subscription.stop();
            if (options.afterStop) {
              serverLog.log('test afterStop', function () {
                options.afterStop(assert, onComplete);
              });
              return;
            }
            serverLog.log('test complete', function () {
              onComplete();
            });
          });
        }, subscription);
      });
    });
    serverLog.log('** Init test data', function () {
      Meteor.call('batch-publication.methods.initTestData', function () {
        serverLog.log('** ' + testName + ': Subscribing', function () {
          subscription = Meteor.subscribe.apply(Meteor, args);
        });
      });
    });
  });
};

testPublication('BatchPublication - Should publish all posts', {
  publication: 'batch-publication.publish.posts',

  testHandler: function (assert, onComplete) {
    var posts = Posts.find();
    assert.equal(posts.count(), 4, 'Post count');

    onComplete();
  }
});

testPublication('BatchPublication - Should remove post, if post is deleted', {
  publication: 'batch-publication.publish.posts',
  testHandler: function (assert, onComplete) {
    assert.equal(Posts.find().count(), 4, 'Post count');

    Meteor.call('batch-publication.methods.removePost', Posts.findOne()._id, function (err) {
      assert.isUndefined(err);

      assert.equal(Posts.find().count(), 3, 'Post absent post-change');

      onComplete();
    });
  }
});

testPublication('BatchPublication - Should not have posts if not subscribed to. ', {
  publication: 'batch-publication.publish.posts',
  testHandler: function (assert, onComplete) {
    onComplete();
  },
  afterStop: function (assert, onComplete) {
    assert.equal(Posts.find().count(), 0, 'Post count');
    onComplete();
  }
});

Tinytest.addAsync('BatchPublication - Multiple clients - isPublicationAlive', function (assert, onComplete) {

  var client = new MultiClient(2);

  var subName = 'batch-publication.publish.posts';

  client.subscribe(MultiClient.groups.ALL, subName, {}, function () {
    Meteor.call('isPostsPublicationAlive', function (error, result) {
      assert.equal(result, true, 'BatchPublication alive after subscribe');
      client.stop(MultiClient.groups.ALL, subName, function () {
        Meteor.call('isPostsPublicationAlive', function (error, result) {
          assert.equal(result, false, 'BatchPublication alive after stop');
          onComplete();
        });
      });
    });
  });
});

Tinytest.addAsync('BatchPublication - Multiple clients - subscribe', function (assert, onComplete) {

  var client = new MultiClient(2);

  var subName = 'batch-publication.publish.posts';

  client.subscribe(MultiClient.groups.ALL, subName, {}, function () {
    client.do(MultiClient.groups.ALL, function (singleClient) {
      assert.equal(singleClient.collections.posts.find().count(), 4, 'Post count');
    });
    client.stop(MultiClient.groups.ALL, subName, onComplete);
  });
});

Tinytest.addAsync('BatchPublication - Multiple clients - subscribe and stop all', function (assert, onComplete) {

  var client = new MultiClient(2);

  var subName = 'batch-publication.publish.posts';

  client.subscribe(MultiClient.groups.ALL, subName, {}, function () {

    client.do(MultiClient.groups.ALL, function (singleClient) {
      assert.equal(singleClient.collections.posts.find().count(), 4, 'All Post count');
    });

    client.stop(MultiClient.groups.ALL, subName, function () {

      client.do(MultiClient.groups.ALL, function (singleClient) {
        assert.equal(singleClient.collections.posts.find().count(), 0, 'All Post count after stop');
      });

      onComplete();
    });
  });
});

Tinytest.addAsync('BatchPublication - Multiple clients - subscribe and stop part', function (assert, onComplete) {

  var client = new MultiClient(2);

  var subName = 'batch-publication.publish.posts';

  client.subscribe(MultiClient.groups.ALL, subName, {}, function () {

    client.do(MultiClient.groups.ALL, function (singleClient) {
      assert.equal(singleClient.collections.posts.find().count(), 4, 'Post count all');

      client.stop(MultiClient.groups.GROUP_A, subName, function () {

        client.do(MultiClient.groups.GROUP_A, function (singleClient) {
          assert.equal(singleClient.collections.posts.find().count(), 0, 'Post count A after stop');
        });

        client.do(MultiClient.groups.GROUP_B, function (singleClient) {
          assert.equal(singleClient.collections.posts.find().count(), 4, 'Post count B after A stop');
        });

        Meteor.call('batch-publication.methods.insertPost', 'a new title', 'a new author', function () {

          client.do(MultiClient.groups.GROUP_A, function (singleClient) {
            assert.equal(singleClient.collections.posts.find().count(), 0, 'Post count A after stop B insert');

          });

          client.do(MultiClient.groups.GROUP_B, function (singleClient) {
            assert.equal(singleClient.collections.posts.find().count(), 5, 'Post count after B insert');
          });

          onComplete();
        });
      });
    });


  });
});

