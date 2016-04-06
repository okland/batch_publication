/**
 * Set up publications for testing
 */
if (Meteor.isServer) {

  var postPublicationChildren = [
    {
      find: function (post) {
        return Authors.find({username: post.author});
      }
    },
    {
      find: function (post) {
        return Comments.find({postId: post._id});
      },
      children: [
        {
          find: function (comment) {
            return Authors.find({username: comment.author});
          }
        }
      ]
    }
  ];

  Meteor.publishBatchComposite('batch-publication.publish.allPosts', {
    find: function () {
      return Posts.find();
    },
    children: postPublicationChildren
  });

  Meteor.publishBatchComposite('batch-publication.publish.userPosts', function (username) {
    return {
      find: function () {
        return Posts.find({author: username});
      },
      children: postPublicationChildren
    };
  });

  Meteor.publishBatchComposite('batch-publication.publish.postsAsArticles', {
    collectionName: 'batch-publication.collection.articles',
    find: function () {
      return Posts.find();
    }
  });

  Meteor.publishBatchComposite('batch-publication.publish.pubWithChildThatReturnsNullIfAuthorIsMarie', {
    find: function () {
      return Posts.find();
    },
    children: [
      {
        find: function (post) {
          if (post.author === 'marie') {
            return null;
          }

          return Comments.find({postId: post._id});
        }
      }
    ]
  });

  Meteor.publishBatchComposite('batch-publication.publish.publishCommentAuthorsInAltClientCollection', {
    find: function () {
      return Posts.find();
    },
    children: [
      {
        find: function (post) {
          return Authors.find({username: post.author});
        }
      },
      {
        find: function (post) {
          return Comments.find({postId: post._id});
        },
        children: [
          {
            collectionName: 'batch-publication.collection.commentAuthors',
            find: function (comment) {
              return Authors.find({username: comment.author});
            }
          }
        ]
      }
    ]
  });

  Meteor.publishBatchComposite('batch-publication.publish.twoUsersPosts', function (username1, username2) {
    return [
      {
        find: function () {
          return Posts.find({author: username1});
        },
        children: postPublicationChildren
      },
      {
        find: function () {
          return Posts.find({author: username2});
        },
        children: postPublicationChildren
      }
    ];
  });

  Meteor.publishBatchComposite('batch-publication.publish.twoFixedAuthors', [
    {
      find: function () {
        return Authors.find({username: 'marie'});
      }
    },
    {
      find: function () {
        return Authors.find({username: 'albert'});
      }
    }
  ]);

  Meteor.publishBatchComposite('batch-publication.publish.returnNothing', function () {
  });
}

if (Meteor.isClient) {
  Articles = new Meteor.Collection('batch-publication.collection.articles');
  CommentAuthors = new Meteor.Collection('batch-publication.collection.commentAuthors');
}


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
            serverLog.log('test complete', function () {
              onComplete();
            });
          });
        }, subscription);
      });
    });

    Meteor.call('batch-publication.methods.initTestData');

    serverLog.log('** ' + testName + ': Subscribing', function () {
      subscription = Meteor.subscribe.apply(Meteor, args);
    });
  });
};


/**
 * Define tests
 */
if (Meteor.isClient) {
  testPublication('PublishCompositeBatch - Should publish all posts', {
    publication: 'batch-publication.publish.allPosts',

    testHandler: function(assert, onComplete) {
      var posts = Posts.find();
      assert.equal(posts.count(), 4, 'Post count');

      onComplete();
    }
  });

  testPublication('PublishCompositeBatch - Should publish all post authors', {
    publication: 'batch-publication.publish.allPosts',

    testHandler: function(assert, onComplete) {
      var posts = Posts.find();

      posts.forEach(function(post) {
        var author = Authors.findOne({ username: post.author });
        assert.isTrue(typeof author !== 'undefined', 'Post author');
      });

      onComplete();
    }
  });

  testPublication('PublishCompositeBatch - Should publish all post comments', {
    publication: 'batch-publication.publish.allPosts',

    testHandler: function(assert, onComplete) {
      var comments = Comments.find();
      assert.equal(comments.count(), 5, 'Comment count');

      onComplete();
    }
  });

  testPublication('PublishCompositeBatch - Should publish all post comment authors', {
    publication: 'batch-publication.publish.allPosts',

    testHandler: function(assert, onComplete) {
      var comments = Comments.find();

      comments.forEach(function(comment) {
        var author = Authors.findOne({ username: comment.author });
        assert.isTrue(typeof author !== 'undefined', 'Comment author');
      });

      onComplete();
    }
  });

  testPublication('PublishCompositeBatch - Should publish one user\'s posts', {
    publication: 'batch-publication.publish.userPosts',
    args: [ 'marie' ],

    testHandler: function(assert, onComplete) {
      var allSubscribedPosts = Posts.find();
      assert.equal(allSubscribedPosts.count(), 2, 'Post count');

      var postsByOtherAuthors = Posts.find({ author: { $ne: 'marie' } });
      assert.equal(postsByOtherAuthors.count(), 0, 'Post count');

      onComplete();
    }
  });

  testPublication('PublishCompositeBatch - Should remove author when comment is deleted', {
    publication: 'batch-publication.publish.userPosts',
    args: [ 'marie' ],

    testHandler: function(assert, onComplete) {
      var mariesSecondPost = Posts.findOne({ title: 'Marie\'s second post' });

      assert.equal(Authors.find({ 'username': 'richard' }).count(), 1, 'Author present pre-delete');

      var richardsComment = Comments.findOne({ postId: mariesSecondPost._id, author: 'richard' });

      Meteor.call('batch-publication.methods.removeComment', richardsComment._id, function(err) {
        assert.isUndefined(err);

        assert.equal(Authors.find({ 'username': 'richard' }).count(), 0, 'Author absent post-delete');

        onComplete();
      });
    }
  });

  testPublication('PublishCompositeBatch - Should not remove author when comment is deleted if author record still needed', {
    publication: 'batch-publication.publish.userPosts',
    args: [ 'marie' ],

    testHandler: function(assert, onComplete) {
      var mariesSecondPost = Posts.findOne({ title: 'Marie\'s second post' });

      assert.equal(Authors.find({ 'username': 'marie' }).count(), 1, 'Author present pre-delete');

      var mariesComment = Comments.findOne({ postId: mariesSecondPost._id, author: 'marie' });

      Meteor.call('batch-publication.methods.removeComment', mariesComment._id, function(err) {
        assert.isUndefined(err);

        assert.equal(Authors.find({ 'username': 'marie' }).count(), 1, 'Author still present post-delete');

        onComplete();
      });
    }
  });

  testPublication('PublishCompositeBatch - Should remove both post and author if post author is changed', {
    publication: 'batch-publication.publish.userPosts',
    args: [ 'stephen' ],

    testHandler: function(assert, onComplete) {
      var post = Posts.findOne({ title: 'Post with no comments' });

      assert.isTrue(typeof post !== 'undefined' , 'Post present pre-change');
      assert.equal(Authors.find({ 'username': 'stephen' }).count(), 1, 'Author present pre-change');

      Meteor.call('batch-publication.methods.updatePostAuthor', post._id, 'marie', function(err) {
        assert.isUndefined(err);

        assert.equal(Posts.find().count(), 0, 'Post absent post-change');
        assert.equal(Authors.find().count(), 0, 'Author absent post-change');

        onComplete();
      });
    }
  });

  testPublication('PublishCompositeBatch - Should publish new author and remove old if comment author is changed', {
    publication: 'batch-publication.publish.userPosts',
    args: ['albert'],

    testHandler: function (assert, onComplete) {
      var albertsPost = Posts.findOne({title: 'Post with one comment'});
      var comment = Comments.findOne({postId: albertsPost._id, author: 'richard'});

      assert.equal(Authors.find({'username': 'richard'}).count(), 1, 'Old author present pre-change');
      assert.equal(Authors.find({'username': 'john'}).count(), 0, 'New author absent pre-change');

      Meteor.call('batch-publication.methods.updateCommentAuthor', comment._id, 'john', function (err) {
        assert.isUndefined(err);
        assert.equal(Authors.find({'username': 'richard'}).count(), 0, 'Old author absent post-change');
        assert.equal(Authors.find({'username': 'john'}).count(), 1, 'New author present post-change');

        onComplete();
      });
    }
  });

  testPublication('PublishCompositeBatch - Should remove post, comment, and comment author if post is deleted', {
    publication: 'batch-publication.publish.userPosts',
    args: [ 'marie' ],

    testHandler: function(assert, onComplete) {
      var mariesFirstPost = Posts.findOne({ title: 'Marie\'s first post' });

      assert.isTrue(typeof mariesFirstPost !== 'undefined', 'Post present pre-change');
      assert.equal(Comments.find({ postId: mariesFirstPost._id, author: 'albert' }).count(), 1, 'Comment present pre-change');
      assert.equal(Authors.find({ username: 'albert' }).count(), 1, 'Comment author present pre-change');

      Meteor.call('batch-publication.methods.removePost', mariesFirstPost._id, function(err) {
        assert.isUndefined(err);

        assert.equal(Posts.find({ title: 'Marie\'s first post' }).count(), 0, 'Post absent post-change');
        assert.equal(Comments.find({ postId: mariesFirstPost._id, author: 'albert' }).count(), 0, 'Comment absent post-change');
        assert.equal(Authors.find({ username: 'albert' }).count(), 0, 'Comment author absent post-change');

        onComplete();
      });
    }
  });

  testPublication('PublishCompositeBatch - Should publish posts to client side collection named "articles"', {
    publication: 'batch-publication.publish.postsAsArticles',

    testHandler: function(assert, onComplete) {
      assert.equal(Posts.find().count(), 0, 'Posts collection empty on client');
      assert.equal(Articles.find().count(), 4, 'Articles collection not empty on client');

      onComplete();
    }
  });

  testPublication('PublishCompositeBatch - Should handle going from null cursor to non-null cursor when republishing', {
    publication: 'batch-publication.publish.pubWithChildThatReturnsNullIfAuthorIsMarie',

    testHandler: function(assert, onComplete) {
      var mariesFirstPost = Posts.findOne({ title: 'Marie\'s first post' });
      var comments = Comments.find({ postId: mariesFirstPost._id });

      assert.isTrue(comments.count() === 0, 'No comments published');

      Meteor.call('batch-publication.methods.updatePostAuthor', mariesFirstPost._id, 'albert', function(err) {
        assert.isUndefined(err);

        comments = Comments.find({ postId: mariesFirstPost._id });
        assert.isTrue(comments.count() > 0, 'Comments published');

        onComplete();
      });
    }
  });

  testPublication('PublishCompositeBatch - Should handle going from non-null cursor to null cursor when republishing', {
    publication: 'batch-publication.publish.pubWithChildThatReturnsNullIfAuthorIsMarie',

    testHandler: function(assert, onComplete) {
      var albertsPost = Posts.findOne({ author: 'albert' });
      var comments = Comments.find({ postId: albertsPost._id });

      assert.isTrue(comments.count() > 0, 'Comments published');

      Meteor.call('batch-publication.methods.updatePostAuthor', albertsPost._id, 'marie', function(err) {
        assert.isUndefined(err);

        comments = Comments.find({ postId: albertsPost._id });
        assert.isTrue(comments.count() === 0, 'No comments published');

        onComplete();
      });
    }
  });

  testPublication('PublishCompositeBatch - Should remove field from document when it is unset', {
    publication: 'batch-publication.publish.allPosts',

    testHandler: function(assert, onComplete) {
      var albertsPost = Posts.findOne({ author: 'albert' });
      var comment = Comments.findOne({ postId: albertsPost._id });
      assert.isTrue(typeof comment.text !== 'undefined', 'Comment has text field');



      Meteor.call('batch-publication.methods.unsetCommentText', comment._id, function(err) {
        assert.isUndefined(err);

        comment = Comments.findOne({ postId: albertsPost._id });
        assert.isTrue(typeof comment.text === 'undefined', 'Comment no longer has text field');

        onComplete();
      });
    }
  });

  testPublication('PublishCompositeBatch - Should publish authors to both Authors and CommentAuthors collections', {
    publication: 'batch-publication.publish.publishCommentAuthorsInAltClientCollection',

    testHandler: function(assert, onComplete) {
      var albertAsAuthor = Authors.findOne({ username: 'albert' });
      var albertAsCommentAuthor = CommentAuthors.findOne({ username: 'albert' });

      assert.isTrue(typeof albertAsAuthor !== 'undefined', 'Albert present in Authors collection');
      assert.isTrue(typeof albertAsCommentAuthor !== 'undefined', 'Albert present in CommentAuthors collection');

      onComplete();
    }
  });

  testPublication('PublishCompositeBatch - Should publish two top level publications specified with a function', {
    publication: 'batch-publication.publish.twoUsersPosts',
    args: [ 'marie', 'albert' ],

    testHandler: function(assert, onComplete) {
      var mariesPost = Posts.findOne({ author: 'marie' });
      var albertsPost = Posts.findOne({ author: 'albert' });

      assert.isTrue(typeof mariesPost !== 'undefined', 'Marie\'s post present');
      assert.isTrue(typeof albertsPost !== 'undefined', 'Albert\'s post present');

      onComplete();
    }
  });

  testPublication('PublishCompositeBatch - Should publish two top level publications specified with an array', {
    publication: 'batch-publication.publish.twoFixedAuthors',

    testHandler: function(assert, onComplete) {
      var marie = Authors.findOne({ username: 'marie' });
      var albert = Authors.findOne({ username: 'albert' });

      assert.isTrue(typeof marie !== 'undefined', 'Marie present');
      assert.isTrue(typeof albert !== 'undefined', 'Albert present');

      onComplete();
    }
  });

  testPublication('PublishCompositeBatch - Should gracefully return if publication handler returns nothing', {
    publication: 'batch-publication.publish.returnNothing',

    testHandler: function(assert, onComplete, subscription) {
      assert.isTrue(subscription.ready(), 'Subscription is ready');

      onComplete();
    }
  });
}
