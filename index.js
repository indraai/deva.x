// Copyright (c)2021 Quinn Michaels
const fs = require('fs');
const path = require('path');

const data_path = path.join(__dirname, 'data.json');
const {agent,vars} = require(data_path).data;

const Deva = require('@indra.ai/deva');
const Twitter = require('@indra.ai/twitter');

const TWITTER = new Deva({
  agent: {
    uid: agent.uid,
    key: agent.key,
    name: agent.name,
    describe: agent.describe,
    prompt: agent.prompt,
    voice: agent.voice,
    profile: agent.profile,
    translate(input) {
      return input.trim();
    },
    parse(input) {
      return input.trim().split(':br:').join('\n').split(':p:').join('\n\n');
    }
  },
  vars,
  listeners: {},
  modules: {
    twitter: {},
  },
  deva: {},
  func: {
    timeline(packet) {
      const {params} = packet.q.meta;
      this.func.setScreenName(params[1]);
      // define the data object here so we can write it to the result
      let data = false;
      // if you want to change the count then add it after the screen_name parameter in index 1
      if (params[2]) this.vars.params.timeline.count = params[2];
      // if there is no text in the packet then set the
      if (!packet.q.text) this.vars.params.timeline.screen_name = this.vars.screen_name;
      else this.vars.params.timeline.screen_name = packet.q.text;
      return new Promise((resolve, reject) => {
        this.modules.twitter[this.vars.screen_name].timeline(this.vars.params.timeline).then(result => {
          data = result;
          const text = result.map(m => {
            return [
              `::begin:tweet`,
              `avatar:${m.user.profile_image_url_https}`,
              `::begin:profile`,
              `name:${m.user.name} (@${m.user.screen_name})`,
              `status: ${m.text.replace(/\n/g, ' ')}`,
              `\nlink[Original Tweet]:https://twitter.com/${m.user.screen_name}/statuses/${m.id_str}`,
              `::end:profile`,
              `::end:tweet`,
              '',
            ].join('\n');
          }).join('\n');
          return this.question(`#feecting parse ${text}`);
        }).then(parsed => {
          return resolve({
            text: parsed.a.text,
            html: parsed.a.html,
            data,
          })
        }).catch(err => {
          return this.error(err, packet, reject);
        });
      });
    },
    show(packet) {
      const {params} = packet.q.meta;
      this.func.setScreenName(params[1]);
      let data;
      // if you want to change the count then add it after the screen_name parameter in index 1
      // if there is no text in the packet then set the
      return new Promise((resolve, reject) => {
        if (!packet.q.text) reject(this.vars.messages.error);
        this.modules.twitter[this.vars.screen_name].show(packet.q.text).then(twt => {
          data = twt;
          const text = [
              `::begin:tweet`,
              `avatar:${twt.user.profile_image_url_https}`,
              `::begin:profile`,
              `name:${twt.user.name} (@${twt.user.screen_name})`,
              `status: ${twt.full_text.replace(/\n/g, ' ')}`,
              `link[Tweet]:https://twitter.com/${twt.user.screen_name}/statuses/${twt.id_str}`,
              `::end:profile`,
              `::end:tweet`,
              '',
            ].join('\n');

          return this.question(`#feecting parse ${text}`);
        }).then(parsed => {
          return resolve({
            text: parsed.a.text,
            html: parsed.a.html,
            data,
          })
        }).catch(err => {
          return this.error(err, packet, reject);
        });
      });
    },
    user(opts) {
      let data = false;
      this.vars.params.user.screen_name = opts.text;
      return new Promise((resolve, reject) => {
        this.modules.twitter[this.vars.screen_name].user(this.vars.params.user).then(result => {
          data = result;
          const describe = result.description ? result.description.replace(/\n/g, ' ') : '';
          const status = result.status && result.status.text ? result.status.text.replace(/\n/g, ' ') : '';
          const formatted = [
            '::begin:user',
            `avatar:${result.profile_image_url_https}`,
            '::begin:profile',
            `name:${result.name} (@${result.screen_name})`,
            `network: ${result.followers_count} | ${result.friends_count} | ${result.following}`,
            `describe: ${describe}`,
            `status: ${status}`,
            `link: https://twitter.com/${result.screen_name}`,
            '::end:profile',
            '::end:user',
            '',
          ].join('\n');
          return this.question(`#feecting parse ${formatted}`);
        }).then(formatted => {
          return resolve({
            text: formatted.a.text,
            html: formatted.a.html,
            data,
          })
        }).catch(err => {
          return this.error(err, packet, reject);
        });
      });
    },
    newThread(id) {
      this.vars.thread = id ? id : '';
      return Promise.resolve({
        text: this.vars.messages.new_thread,
        html: this.vars.messages.new_thread,
      })
    },
    setScreenName(name=false) {
      const {vars} = this;
      if (!name) return;

      // load the screen names into a local array
      const screen_names = this.client.services.twitter.auth.map(au => au.screen_name.toLowerCase())

      // if there are no more screen names reload the array.
      if (!vars.screen_names.length) this.vars.screen_names = screen_names;

      // if there is no thread then set the screen_name to main account.
      if (!vars.screen_name) {
        this.vars.screen_name = this.client.services.twitter.main_account;
      }

      // if we have a random screen_name select from screen_names array.
      if (name === 'random') {
        const splice_index = Math.floor(Math.random() * vars.screen_names.length);
        this.vars.screen_name = vars.screen_names.splice(splice_index, 1)[0].toLowerCase();
        return;
      }

      // then we check to see if the screen name matches the parameter.
      const _lookup = this.client.services.twitter.auth.find(au => au.screen_name.toLowerCase() === name.toLowerCase()) || false;

      if (_lookup.screen_name) {
        this.vars.screen_name = _lookup.screen_name.toLowerCase();
        this.vars.tags = _lookup.tags;
      }
      else this.vars.screen_name = this.client.services.twitter.main_account;
      return;
    },

    /**************
    method: image
    params: packet
            text: packet.q.text
            screen_name: packet.q.meta.params[1]
            image: packet.q.data.image
            tags: packet.q.data.tags

    describe:
    ***************/
    image(packet) {
      this.func.setScreenName(packet.q.meta.params[1]);
      if (packet.q.meta.params[2]) this.func.newThread(packet.q.meta.params[2]);

      const {data, text, meta} = packet.q;
      const user_tags = data.card ? data.card.tags : this.vars.tags;

      const {long} = this.vars.params;

      const tagLen = user_tags.length + packet.id.toString().length + 10;
      const textLen = packet.q.text.length + tagLen;
      const trimLen = textLen > long ? long - tagLen  : 0;
      const trimText = trimLen ? this.lib.trimText(packet.q.text, trimLen) : packet.q.text;

      const status = `${trimText} ${user_tags} #Q${packet.id}`;

      return new Promise((resolve, reject) => {
        this.modules.twitter[this.vars.screen_name].image({media_data: data.image}).then(upload => {
          return this.modules.twitter[this.vars.screen_name].tweet({
            status,
            in_reply_to_status_id: this.vars.thread,
            auto_populate_reply_metadata: true,
            tweet_mode: this.vars.tweet_mode,
            media_ids: upload.media_id_string,
          })
        }).then(result => {
          if (!this.vars.thread) this.vars.thread = result.id_str;
          const link = `https://twitter.com/${result.user.screen_name}/status/${result.id_str}`;
          const html = this.func.htmlFromResult(result, true);
          // reset the packet meta/agent before return
          return resolve({
            text: `\nlink: ${link}\ntext: ${result.full_text}`,
            html,
            data: result,
          });
        }).catch(err => {
          return this.error(err, packet, reject);
        });
      });
    },

    tweet(packet) {
      this.func.setScreenName(packet.q.meta.params[1]);

      let status = this.lib.trimText(packet.q.text, this.vars.params.short).replace(':tags:', `:p:${this.vars.tags}`).replace(':id:', `:br:#Q${packet.id}`);
      status = this.agent.parse(status);

      return new Promise((resolve, reject) => {
        this.modules.twitter[this.vars.screen_name].tweet({
          status,
          in_reply_to_status_id: this.vars.thread,
          auto_populate_reply_metadata: true,
          tweet_mode: this.vars.tweet_mode,
        }).then(result => {
          try {
            if (!this.vars.thread) this.vars.thread = result.id_str;
            const link = `https://twitter.com/${result.user.screen_name}/statuses/${result.id_str}`;
            const html = this.func.htmlFromResult(result);

            return resolve({
              text: `link: ${link}\ntext: ${result.full_text}`,
              html,
              data: result,
            });
          } catch (e) {
            return reject(e);
          }
        }).catch(err => {
          return this.error(err, packet, reject);
        });
      });
    },

    htmlFromResult(result, image=false) {
      const {id_str, user, entities, full_text} = result
      const tweet_url = `https://twitter.com/${user.screen_name}/status/${id_str}`;
      const ent = entities && entities.media ? entities.media[0] : false;
      return [
        `<article class="tweet">`,
        `<div class="profile">`,
        `<div class="profile_image"><img src="${user.profile_image_url_https}"></div>`,
        `<div class="screen_name">@${user.screen_name}</div>`,
        `<a href="${tweet_url}" target="_blank">Link</a>`,
        `</div>`,
        `<div class="text">${full_text}</div>`,
        ent ? `<div class="image"><a href="${tweet_url}" target="twitter"><img src="${ent.media_url_https}"/></a></div>` : '',
        `</article>`,
      ].join('\n');
    },

    mentions(packet) {
      this.func.setScreenName(packet.q.meta.params[1]);
      return new Promise((resolve, reject) => {
        this.modules.twitter[this.vars.screen_name].mentions(this.vars.params.mentions).then(ment => {
          const html = ment.map(m => {
            return `<div class="tweet">
              <span class="screen_name">@${m.user.screen_name}</span>
              <span class="tweet_text">${m.text}</span>
            </div><div><hr></div>`;
          }).join('\n');

          return resolve({
            text: 'Twitter Mentions',
            html,
            data: ment,
          });
        }).catch(err => {
          return this.error(err, packet, reject);
        });
      });
    },

    search(packet) {
      const {params} = packet.q.meta;
      this.func.setScreenName(params[1]);

      return new Promise((resolve, reject) => {
        let data = false;
        this.modules.twitter[this.vars.screen_name].search({
          q: packet.q.text,
          count: params[1] || this.vars.params.search.count,
          type: params[2] || this.vars.params.search.type,
          lang: params[3] || this.vars.params.search.lang,
          include_entities: params[4] || this.vars.params.search.include_entities,
        }).then(result => {
          data = result.statuses;
          const text = result.statuses.map(m => {
            return [
              `::begin:tweet`,
              `avatar:${m.user.profile_image_url_https}`,
              `::begin:profile`,
              `name:${m.user.name} (@${m.user.screen_name})`,
              `status: ${m.text.replace(/\n/g, ' ')}`,
              `\nlink[${this.vars.messages.view}]:https://twitter.com/${m.user.screen_name}/statuses/${m.id_str}`,
              `::end:profile`,
              `::end:tweet`,
              '',
            ].join('\n');
          }).join('\n----\n\n');
          return this.question(`#feecting parse ${text}`);
        }).then(parsed => {
          return resolve({
            text: parsed.a.text,
            html: parsed.a.html,
            data,
          })
        }).catch(err => {
          return this.error(err, packet, reject);
        });
      });
    },


    login() {
      return new Promise((resolve, reject) => {
        this.client.services.twitter.auth.forEach(tw => {
          const sn = tw.screen_name.toLowerCase();
          this.modules.twitter[sn] = new Twitter(tw);
          this.modules.twitter[sn].verify_credentials().then(profile => {
            if (profile.suspended) this.rompt(`SUSPENDED: ${profile.screen_name}`);
          }).catch(err => {
            return this.error(err, false, reject);
          });
        });
        return resolve(true)
      });
    },
  },

  methods: {
    /**************
    func:     acct
    params: packet
    describe: set the account to tweet from
    ***************/
    acct(packet) {
      this.func.setScreenName(packet.q.meta.params[1]);
      return Promise.resolve({text:`acct: ${this.vars.screen_name}`});
    },

    /***********
      func: timeline
      params: packet
      describe: gets the timeline for a specific user
    ***********/
    timeline(packet) {
      return this.func.timeline(packet)
    },
    user(packet) {
      return this.func.user(packet.q);
    },

    /***********
      func: thread
      params: packet
      describe: starts a new twitter thread
    ***********/
    thread(packet) {
      const id = packet.q.meta.params[1] || '';
      return this.func.newThread(id);
    },

    // show a tweet
    // params:
    // id: {packet.q.text}
    show(packet) {
      return this.func.show(packet);
    },
    // send a tweet
    // params:
    // status: {packet.q.text}
    // 1. in_reply_to_status_id
    tweet(packet) {
      return this.func.tweet(packet);
    },

    // send a tweet with an image attached
    // params:
    // status: {packet.q.text}
    // data: packet.q.data.image
    // 1. in_reply_to_status_id
    image(packet) {
      return this.func.image(packet);
    },
    // mentions timeline
    // #twitter mentions:true|false
    // params
    // 1. count - count of records to return
    // 2. include_entities - true|false to include entities
    mentions(packet) {
      this.vars.params.mentions.count = packet.q.meta.params[1] || this.vars.params.mentions.count;
      if (packet.q.meta.params[2]) this.vars.params.mentions.since_id = packet.q.meta.params[2];
      return this.func.mentions(packet);
    },
    // search params
    // #twitter search:10:recent:true:extended <search query>
    // #twitter search <search query>
    // q: <search query>
    // 1. count (optional)
    // 2. type [mixed|recent|popular] (optional)
    // 3. include_entities [true|false] (optional)
    search(packet) {
      return this.func.search(packet);
    },

    uid(packet) {
      return Promise.resolve(this.uid());
    },
    status(packet) {
      return this.status();
    },
    help(packet) {
      return new Promise((resolve, reject) => {
        this.lib.help(packet.q.text, __dirname).then(text => {
          return resolve({text})
        }).catch(reject);
      });
    }
  },
  onEnter() {
    this.func.login();
    return this.done();
  },
  onExit() {
    return this.done();
  },
  onDone() {
    return Promise.resolve(this.vars.messages.done);
  },
  onInit() {
    // set the default screen_name at init to the main account.
    this.func.newThread();
    this.func.setScreenName(this.client.services.twitter.main_account);
    return this.start();
  },
  onError(err) {
    console.log('twitter error', err);
  }
});
module.exports = TWITTER
