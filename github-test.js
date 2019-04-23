(function(stream) {
  function link(route, params) {
    var link = route;
    Object.keys(params).forEach(function(param) {
      link = link.replace(new RegExp(":" + param), params[param]);
    });
    return link;
  }

  function endpoint(method, url) {
    return function(params, bodyOrCallback, callback) {
      if (arguments.length === 2) {
        callback = bodyOrCallback;
        bodyOrCallback = undefined;
      }
      var req = new XMLHttpRequest();
      req.open(method, link(url, params || {}));
      req.setRequestHeader("Content-Type", "application/json");
      req.send(bodyOrCallback);
      req.onload = function() {
        callback.call(req, req);
      };
      req.onerror = function() {
        console.log(req)
        callback.call(req, req);
      }
      return req;
    };
  }

  var api = {
    github: {
      repo: endpoint("GET", "https://api.github.com/repos/:user/:repo"),
      release: endpoint(
        "GET",
        "https://api.github.com/repos/:user/:repo/releases/latest"
      )
    },
    plugins: endpoint("GET", "/plugins.json")
  };

  var plugins = stream();

  var getPlugins = api.plugins();
  getPlugins.onload = function() {
    try {
      plugins(JSON.parse(getPlugins.response));
    } catch (err) {
      console.log(err);
    }
  };
  var initial = 0, loading = 2, error = 3, loaded = 4;
  var states = {
    initial: initial,
    loading: loading,
    error: error,
    loaded: loaded
  };

  function GithubRepo(owner, name) {
    this.owner = owner;
    this.name = name;
    this.info = null;
    this.release = null;

    var state = {
      info: stream(states.initial),
      release: stream(states.initial)
    }

    Object.defineProperty(this, 'state', {
      get: function() {
        var interface = {};

        Object.keys(state).forEach(function(key) {
          Object.defineProperty(interface, key, {
            get: function() {
              return state[key]();
            },
            set: function(s) {
              if (states.hasOwnProperty(s))
                state[key](states[s]);
              else if (Object.keys(states).map(function(k) { return states[k]; }).indexOf(s) > -1)
                state[key](s);
            }
          })
        });

        return interface;
      }
    });
  }

  GithubRepo.prototype.getInfo = function() {
    var self = this;

    self.state.info = loading;

    endpoint("GET", "https://api.github.com/repos/:user/:repo")(
      {
        user: this.owner,
        repo: this.name
      },
      function() {
        var req = this;
        try {
          self.state.info = loaded;
          self.info = JSON.parse(req.response);
        } catch (err) {
          self.state.info = error;
        }
      }
    );
  };

  GithubRepo.prototype.getRelease = function() {
    var self = this;

    self.state.release = loading;

    endpoint("GET", "https://api.github.com/repos/:user/:repo/releases/latest")(
      {
        user: this.owner,
        repo: this.name
      },
      function() {
        var req = this;

        try {
          if (req.status === 200) {
            self.state.release = loaded;
            self.release = JSON.parse(req.response);
          } else {
            self.state.release = error;
            self.release = false;
          }
        } catch (err) {
          self.state.release = error;
        }
      }
    );
  };

  var repos = plugins.map(function(plugins) {
    return plugins
      ? plugins.map(function(plugin) {
          var repo = new GithubRepo(plugin.owner, plugin.repository);

          if (plugin.repository) {
            repo.getInfo();
            repo.getRelease();
          }

          return repo;
        })
      : null;
  });

  window.data = {
    repos: repos,
    plugins: plugins
  };
})(m.stream);
