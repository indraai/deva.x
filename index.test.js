// Copyright (c)2021 Quinn Michaels
// Twitter Deva test file

const {expect} = require('chai')
const twitter = require('./index.js');

describe(twitter.me.name, () => {
  beforeEach(() => {
    return twitter.init()
  });
  it('Check the SVARGA Object', () => {
    expect(twitter).to.be.an('object');
    expect(twitter).to.have.property('me');
    expect(twitter).to.have.property('vars');
    expect(twitter).to.have.property('listeners');
    expect(twitter).to.have.property('methods');
    expect(twitter).to.have.property('modules');
  });
})
