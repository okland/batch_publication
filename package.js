Package.describe({
  name: 'okland:batch-publication',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: '',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function (api) {
  api.use([ 'minimongo', 'ejson',  'diff-sequence', 'sha'], ['server']);
  api.use(['ecmascript', 'mongo-id', 'underscore', 'ddp-server', 'ddp-common', 'ddp-client'], ['server', 'client']);

  api.mainModule('./batch-publication-ddp-client.js', ['client']);
  api.mainModule('./server.js', ['server']);
});

Package.onTest(function (api) {
  api.use('okland:batch-publication');
  api.use(['underscore', 'mongo', "tinytest", "ddp-server", "ddp-client", "ecmascript"]);

  api.add_files(["tests/common-tests.js", "tests/publish_composite_batch-tests.js",
      "tests/multi-client-tests.js", "tests/stream-publication-tests.js"]);

  api.add_files(["tests/batch-publication-client-tests.js"], ["client"]);
  api.add_files(["tests/batch-publication-server-tests.js"], ["server"]);
});
