/**
 * Set up publications for testing
 */
import {BatchPublicationFactory} from "meteor/okland:batch-publication";

BatchPublicationFactory.publishCollection({
  name: 'batch-publication.publish.posts',
  collection: Posts,
  isValid: function () {
    return true;
  },
  options: {},
  query: {}
});
var publicationPublishKey = BatchPublicationFactory.getPublicationKey('batch-publication.publish.posts', Posts, {}, {});

Meteor.methods({
  isPostsPublicationAlive: function () {
    return BatchPublicationFactory.isBatchPublicationAlive(publicationPublishKey);
  }
});
