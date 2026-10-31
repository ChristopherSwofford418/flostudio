import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFacebookPageGraphicSvg, buildFacebookPageKit, buildFacebookPageOnePagerText, requiresFacebookKitReview, slugifyFacebookHandle } from '../src/lib/facebookPageKits.js'

const groundedApp = {
  id:'app-1',
  name:'MatterPrep: Legal AI Help',
  category:'Legal education',
  product_url:'https://apps.apple.com/us/app/matterprep/id6781106756',
  description:'MatterPrep helps people organize plain-language legal information and self-help tasks.',
  offer_text:'Explore the app',
  audience:'People organizing legal information and self-help tasks.',
  imageUrl:'https://example.com/matterprep-icon.png',
  sourceFacts:{
    currentProductionTitle:'MatterPrep: Legal AI Help',
    appStoreListing:{ syncedAt:'2026-10-31T00:00:00.000Z' },
    socialLinks:{ facebook:'https://www.facebook.com/matterprepapp' },
  },
  brandDna:{
    voice:'Clear, calm, and practical.',
    visualDirection:'Simple editorial cards.',
    proofPoints:'Self-help organization only; not a law firm or legal representation.',
    restrictedClaims:'Do not imply legal advice, attorney-client relationship, legal accuracy, deadlines, or outcomes.',
  },
}

test('builds a per-app Facebook Page Kit from grounded product and brand facts', () => {
  const kit = buildFacebookPageKit(groundedApp)
  assert.equal(kit.productId, 'app-1')
  assert.equal(kit.appName, 'MatterPrep: Legal AI Help')
  assert.equal(kit.category, 'Legal education')
  assert.equal(kit.destinationLabel, 'Explore the app')
  assert.equal(kit.destinationUrl, groundedApp.product_url)
  assert.equal(kit.pageUrl, 'https://www.facebook.com/matterprepapp')
  assert.equal(kit.graphicAvailable, true)
  assert.equal(kit.requiresReview, true)
  assert.match(kit.about, /organize plain-language legal information/i)
  assert.match(kit.restrictedClaims, /attorney-client/i)
})

test('does not invent missing product audience, offer, or artwork', () => {
  const kit = buildFacebookPageKit({ id:'sparse', name:'Plain App', description:'A saved product description.' })
  assert.match(kit.audience, /Add the intended audience/i)
  assert.equal(kit.destinationLabel, 'Add an approved call to action')
  assert.equal(kit.destinationUrl, '')
  assert.equal(kit.graphicAvailable, false)
  assert.equal(kit.pageUrl, '')
})

test('uses safe derived handles and treats availability as unverified', () => {
  assert.equal(slugifyFacebookHandle('TagSnap: Registration Alert'), '@tagsnapregistrationalert')
  const kit = buildFacebookPageKit(groundedApp)
  assert.match(kit.handleAvailability, /Not checked/i)
})

test('marks health, legal, and finance-adjacent apps for a regulated review', () => {
  assert.equal(requiresFacebookKitReview(groundedApp), true)
  assert.equal(requiresFacebookKitReview({ name:'Meditation timer', category:'Lifestyle', description:'Simple daily timer.' }), false)
})

test('one-pager copy preserves manual-review and no-publish boundaries', () => {
  const text = buildFacebookPageOnePagerText(buildFacebookPageKit(groundedApp))
  assert.match(text, /FACEBOOK PAGE ONE-PAGER/)
  assert.match(text, /does not create a Facebook Page, connect an account, publish content/i)
  assert.match(text, /attorney-client/i)
  assert.match(text, /MatterPrep: Legal AI Help/)
})

test('download graphic is deterministic and contains no fabricated metrics', () => {
  const svg = buildFacebookPageGraphicSvg(buildFacebookPageKit(groundedApp))
  assert.match(svg, /<svg/)
  assert.match(svg, /MatterPrep: Legal AI Help/)
  assert.match(svg, /Review-ready setup kit/)
  const visibleText = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(match => match[1]).join(' ')
  assert.doesNotMatch(visibleText, /#1|guaranteed|rating|reviews/i)
})

test('rejects credential-bearing artwork and Page URLs', () => {
  const kit = buildFacebookPageKit({
    id:'unsafe',
    name:'Safe App',
    imageUrl:'https://user:pass@example.com/icon.png',
    sourceFacts:{ socialLinks:{ facebook:'https://token@example.com/page' } },
  })
  assert.equal(kit.artworkUrl, '')
  assert.equal(kit.pageUrl, '')
  assert.equal(kit.graphicAvailable, false)
})
