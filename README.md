# git-deploy

A simple server with little dependencies for deployment via gitlab-hooks.

It includes a minimalitics frontent (Dashboard), that shows you a list of available
builds, their build logs and build status.

## Usage

Install:

```shell
git clone https://github.com/windycom/git-deploy.git
cd git-deploy
npm i
```
Run as:
```
node server [<configname>]
```
or
```
npm start [<configname>]
```
where `configname` defaults to `default`.

Start by making a local copy of the default configuration file:
[`config/default.js`](config/default.js) => `config/default.local.js` and edit that one.

`.local.*`-files are gitignored, so they will survive updates. The server will pick up
the local file over the global.

Adjust the file to your needs, then start the server.

```shell
npm start
```

## How it works

git-deploy works based on the filesystem and git, it doesn't use a database.

When the server receives a request, it will try to find a target for the
repository/reference-combination the request is for. If it does, it will spawn
a child process, that will checkout that reference and run a build.

Finding a target is done by matching the reference (e.g. `refs/tags/rc1.3.0` for a tag)
against a regular expression a target provides:

```
// The repository:
'user.name/fancy-app': {
  targets: [
    {
      match: /^refs\/tags\/rc(.+)$/,
      path: '%1',
      ...
    }
  ]
}
```

The target must provide a `path`, that can contain interpolations from the match.
The name (as well as the name of the repository) are slugified to contain no path-seps,
so the resulting folder structure will be one level deep (`<repository>`/`<currenttarget>`):

```
user-name-fancy-app/rc1.3.0
```

The resulting URLs will also be slugified, so they don't contain dots or slashes
anymore. The URL will also be flat, so it can be used as a subdomain or path
without having to deal with varying depts.

So the build will be available under http://localhost:8080/user-name-fancy-app-rc1-3-0/,
the URL for the logfile will be http://localhost:8080/dashboard/log/user.name-fancy-app/rc1.3.0/.

git-deploy makes sure that only one build at a time can run for a path.

## Config files

When running the server, you can specify a configuration name:

```shell
node server development
```

The name must refer to a config file in `config/`. The file can have different extensions:

```
  .local.js
  .local.conf.js
  .js
  .conf.js
```

The first one found is used (in the order above). This gives `.local`-files precedence,
and since they are gitignored, they will override default files.

So in the case above, one of the following files must exist:
`development.local.js`, `development.local.json` etc.

## Configuration

Have a look at [config/default.js](config/default.js), it's commented.

### Hooks

Of course git-deploy supports hooks. There are:

`postupdate`: Scripts run after the repo was pulled. Use to run things like `npm install`
and build commands.

`postremove`: Scripts run after a build was removed. Use to cleanup things git-deploy
doesn't know about.

All commands are run in the folder where the repository was checked out. They receive the
full path to the current `build.json` via the environment variable `GIT_DEPLOY_DATA_FILE`.

If the command refers to a `.js`-file, it is run via `fork()`. Otherwise `spawn()`
spawns a shell and runs the command there.

