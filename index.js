// Copyright (c)2021 Quinn Michaels
const fs = require('fs');
const path = require('path');

const data_path = path.join(__dirname, 'data.json');
const {agent,vars} = require(data_path).data;

const Deva = require('@feecting/deva');
const Twitter = require('@feecting/twitter');

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
      return input.trim();
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
      this.func.setScreenName(params);
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
    newThread() {
      this.vars.thread = '';
      return Promise.resolve(this.vars.thread);
    },
    setScreenName(params) {
      const {vars} = this;

      // load the screen names into a local array
      const screen_names = this.client.services.twitter.auth.map(au => au.screen_name.toLowerCase())

      // if there are no more screen names reload the array.
      if (!vars.screen_names.length) this.vars.screen_names = screen_names;

      // if there is no thread then set the screen_name to main account.
      if (!vars.screen_name) {
        this.vars.screen_name = this.client.services.twitter.main_account;
        return;
      }

      // if there is nothing to check then return
      const _check = Array.isArray(params) && params[1] ? params[1] : false;
      if (!_check) return;

      // if we have a random screen_name select from screen_names array.
      if (_check === 'random') {
        const splice_index = Math.floor(Math.random() * vars.screen_names.length);
        this.vars.screen_name = vars.screen_names.splice(splice_index, 1)[0].toLowerCase();
        return;
      }

      // then we check to see if the screen name matches the parameter.
      const _lookup = this.client.services.twitter.auth.find(au => au.screen_name.toLowerCase() === _check.toLowerCase()) || false;

      if (_lookup.screen_name) {
        this.vars.screen_name = _lookup.screen_name.toLowerCase();
        this.vars.tags = _lookup.tags;
      }
      else this.vars.screen_name = this.client.services.twitter.main_account;
      return;
    },
    image(packet) {
      this.func.setScreenName(packet.q.meta.params);
      return new Promise((resolve, reject) => {

        this.modules.twitter[this.vars.screen_name].image(packet.q.data).then(upload => {
          const user_tags = this.client.services.twitter.auth.find(t => t.screen_name === this.vars.screen_name);
          const trimLen = this.vars.params.long - (packet.q.text.length + user_tags.tags.length + packet.id.toString().length + user_tags.tags.split(' ').length);
          const status = `${this.lib.trimText(packet.q.text, trimLen)} ${user_tags.tags} #Q${packet.id}`;
          return this.modules.twitter[this.vars.screen_name].tweet({
            status,
            in_reply_to_status_id: this.vars.thread,
            auto_populate_reply_metadata: true,
            tweet_mode: this.vars.tweet_mode,
            media_ids: upload.media_id_string,
          })
        }).then(result => {
          this.vars.thread = result.id_str;
          const link = `https://twitter.com/${result.user.screen_name}/status/${result.id_str}`;
          const html = this.func.htmlFromResult(result, true);
          // reset the packet meta/agent before return
          return resolve({
            text: `link: ${link}\ntext: ${result.full_text}`,
            html,
            data: result,
          });
        }).catch(err => {
          return this.error(err, packet, reject);
        });
      });
    },
    tweet(packet) {
      this.func.setScreenName(packet.q.meta.params);

      const status = this.lib.trimText(packet.q.text, this.vars.params.short).replace(':tags:', this.vars.tags).replace(':id:', `#Q${packet.id}`);

      return new Promise((resolve, reject) => {
        this.modules.twitter[this.vars.screen_name].tweet({
          status,
          in_reply_to_status_id: this.vars.thread,
          auto_populate_reply_metadata: true,
          tweet_mode: this.vars.tweet_mode,
        }).then(result => {
          try {
            this.vars.thread = result.id_str;
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
      return [
        `<article class="tweet">`,
        `<div class="profile">`,
        `<div class="profile_image"><img src="${result.user.profile_image_url_https}"></div>`,
        `</div>`,
        `<div class="text"><a href="https://twitter.com/${result.user.screen_name}/status/${result.id_str}" target="_blank">Link</a>@${result.user.screen_name} > ${result.full_text}</div>`,
        `</article>`,
      ].join('\n')
    },
    mentions(packet) {
      this.func.setScreenName(packet.q.meta.params);
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
      this.func.setScreenName(params);

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

    card(packet) {
      return new Promise((resolve, reject) => {
        this.prompt('MAKING A TWITTER CARD');
        let theCard = false;

        const theText = this.lib.trimText(packet.q.text, 280);
        // if we want to tweet a card we first need to send a message to the artist
        this.question(`#artist card:${packet.q.meta.params[1]} ${packet.q.text}`).then(artist => {
          theCard = artist.a;

          let screen_name = theCard.data.card.acct ? theCard.data.card.acct.toLowerCase() : this.vars.screen_name;
          screen_name = packet.q.meta.params[2] ? packet.q.meta.params[2] : screen_name;

          this.modules.twitter[screen_name].image({
            media_data: theCard.data.image,
          }).then(upload => {
            const user_tags = theCard.data.card || this.vars.tags.find(t => t.screen_name === screen_name);
            const trimLen = this.vars.params.long - (packet.q.text.length + user_tags.tags.length + packet.id.toString().length + user_tags.tags.split(' ').length);
            const status = `${this.lib.trimText(packet.q.text, trimLen)} ${user_tags.tags} #Q${packet.id}`;
            return this.modules.twitter[screen_name].tweet({
              status,
              in_reply_to_status_id: this.vars.thread,
              auto_populate_reply_metadata: true,
              tweet_mode: this.vars.tweet_mode,
              media_ids: upload.media_id_string,
            })
          }).then(tweetResult => {
            this.vars.thread = tweetResult.id_str;
            const tweetURL = `https://twitter.com/${tweetResult.user.screen_name}/status/${tweetResult.id_str}`;
            // reset the packet meta/agent before return
            packet.a.meta.key = this.agent.key;
            packet.a.agent = this.agent;
            packet.a.created = Date.now();
            return resolve({
              text: `card: ${tweetURL}`,
              html: `<div class="feecting-image"><a href="${tweetURL}" target="twitter"><img src="${tweetResult.entities.media[0].media_url_https}"/></a></div>`,
              data: tweetResult,
            });
          }).catch(reject);
        }).catch(reject);
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
            return this.error(err, packet, reject);
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
      this.func.setScreenName(packet.q.meta.params);
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
      this.func.newThread();
      return Promise.resolve({
        text: this.vars.messages.new_thread,
        html: this.vars.messages.new_thread,
      })
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

    card(packet) {
      return this.func.card(packet);
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
    this.vars.screen_name = this.client.services.twitter.main_account;
    return this.start();
  },
  onError(err) {
    console.log('twitter error', err);
  }
});
module.exports = TWITTER
