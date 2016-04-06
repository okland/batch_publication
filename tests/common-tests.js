/**
 * Define collections used in tests
 */
Posts = new Meteor.Collection('batch-publication.collection.posts');
Authors = new Meteor.Collection('batch-publication.collection.authors');
Comments = new Meteor.Collection('batch-publication.collection.comments');

var allow = function () {
  return true;
};
Posts.allow({insert: allow, update: allow, remove: allow});
Authors.allow({insert: allow, update: allow, remove: allow});
Comments.allow({insert: allow, update: allow, remove: allow});

/**
 * Utility methods
 */

function insertPost(title, author, comments) {
  var postId = new Mongo.ObjectID();
  var commentId, commentData;

  Posts.insert({
    _id: postId,
    title: title,
    author: author
  });

  if (comments) {
    for (var i = 0; i < comments.length; i++) {
      commentId = new Mongo.ObjectID();
      commentData = _.extend({_id: commentId, postId: postId}, comments[i]);

      Comments.insert(commentData);
    }
  }
}

if (Meteor.isServer) {
  Meteor.methods({
    'batch-publication.methods.initTestData': function () {
      removeAllData();
      initUsers();
      initPosts();

      function removeAllData() {
        Comments.remove({});
        Posts.remove({});
        Authors.remove({});
      }

      function initUsers() {
        Authors.insert({_id: new Mongo.ObjectID(), username: 'marie'});
        Authors.insert({_id: new Mongo.ObjectID(), username: 'albert'});
        Authors.insert({_id: new Mongo.ObjectID(), username: 'richard'});
        Authors.insert({_id: new Mongo.ObjectID(), username: 'stephen'});
        Authors.insert({_id: new Mongo.ObjectID(), username: 'john'});
      }

      function initPosts() {
        insertPost('Marie\'s first post', 'marie', [{
          text: 'Comment text',
          author: 'albert'
        }]);

        insertPost('Marie\'s second post', 'marie', [
          {
            text: 'Richard\'s comment',
            author: 'richard'
          },
          {
            text: 'Stephen\'s comment',
            author: 'stephen'
          },
          {
            text: 'Marie\'s comment',
            author: 'marie'
          }
        ]);

        insertPost('Post with one comment', 'albert', [{
          text: 'Comment text',
          author: 'richard'
        }]);

        insertPost('Post with no comments', 'stephen');
      }
    },
    'batch-publication.methods.insertPost': function(title, author, comments) {
      insertPost(title, author, comments);
    },
    'batch-publication.log': function (package, message) {
      console.log(`ServerLog from ${package}: ${message}`);
    }
  });
}

Meteor.methods({
  'batch-publication.methods.removePost': function (postId) {
    console.log('calling removePost');
    Posts.remove(postId);
  },
  'batch-publication.methods.removeComment': function (commentId) {
    console.log('calling removeComment');
    Comments.remove(commentId);
  },

  'batch-publication.methods.updatePostAuthor': function (postId, newAuthor) {
    console.log('calling updatePostAuthor, postId: ' + postId + ', newAuthor: ' + newAuthor);
    Posts.update({_id: postId}, {$set: {author: newAuthor}});
  },

  'batch-publication.methods.updateCommentAuthor': function (commentId, newAuthor) {
    console.log('calling updateCommentAuthor, commentId: ' + commentId + ', newAuthor: ' + newAuthor);
    Comments.update({_id: commentId}, {$set: {author: newAuthor}});
  },

  'batch-publication.methods.unsetCommentText': function (commentId) {
    console.log('calling unsetCommentText, commentId: ' + commentId);
    Comments.update({_id: commentId}, {$unset: {text: ''}});
  }
});


function UnitTestLoggerClass(packageName, connection) {
  this.packageName = packageName;
  this.connection = connection;
}

UnitTestLoggerClass.prototype.log = function (message, callback) {
  var toCall = this.connection || Meteor;
  toCall.call('batch-publication.log', this.packageName, message, callback);
};


if (Meteor.isClient) {
  var originalAddAsyncFunction = Tinytest.addAsync;
  var runningTests = {};

  Tinytest.addAsync = function (testName, testFunction) {
    console.log('Added async test: ' + testName);

    originalAddAsyncFunction.call(this, testName, function (assert, onComplete) {
      runningTests[testName] = {};
      Meteor.setTimeout(function () {
        if (_.isUndefined(runningTests[testName].done)) {
          assert.equal(true, false, 'TIMEOUT: ' + testName);
          onComplete();
        }
      }, 5000);

      testFunction(assert, function () {
        runningTests[testName].done = true;
        onComplete();
      });
    });
  };
}

serverLog = new UnitTestLoggerClass('batch-publication');

UnitTestLogger = UnitTestLoggerClass;
