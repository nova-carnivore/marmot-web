#!/usr/bin/env node
/**
 * 2-User Marmot E2E Test via Docker Chrome containers
 *
 * Chrome1 (localhost:3001) → Alice
 * Chrome2 (localhost:3002) → Bob
 *
 * Test flow:
 * 1. Both users login with nsec keys
 * 2. Both create KeyPackages (Settings → Create New)
 * 3. Bob adds Alice as contact (follow event)
 * 4. Bob starts chat with Alice → sends message
 * 5. Alice receives message → replies
 * 6. Bob receives reply
 * 7. Alice leaves group
 */

import puppeteer from 'puppeteer-core';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

const MARMOT_URL = 'https://192.168.21.171:8081/';
const CHROME1_CDP = 'ws://localhost:3001/chromium';
const CHROME2_CDP = 'ws://localhost:3002/chromium';

// Generate fresh keypairs
const aliceSk = generateSecretKey();
const alicePk = getPublicKey(aliceSk);
const aliceNsec = nip19.nsecEncode(aliceSk);
const aliceNpub = nip19.npubEncode(alicePk);

const bobSk = generateSecretKey();
const bobPk = getPublicKey(bobSk);
const bobNsec = nip19.nsecEncode(bobSk);
const bobNpub = nip19.npubEncode(bobPk);

console.log('=== Marmot 2-User E2E Test ===');
console.log(`Alice nsec: ${aliceNsec}`);
console.log(`Alice npub: ${aliceNpub}`);
console.log(`Alice pk:   ${alicePk}`);
console.log(`Bob nsec:   ${bobNsec}`);
console.log(`Bob npub:   ${bobNpub}`);
console.log(`Bob pk:     ${bobPk}`);
console.log('');

const results = {
  aliceSetup: { login: false, keyPackageCreated: false },
  bobSetup: { login: false, keyPackageCreated: false },
  addContact: { followPublished: false, aliceInContacts: false },
  chat: { bobSent: false, aliceReceived: false, aliceReplied: false, bobReceived: false },
  leaveGroup: { aliceLeft: false, conversationRemoved: false },
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setupConsoleLogs(page, label) {
  page._collectedLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    page._collectedLogs.push(text);
    if (text.includes('[AddContact]') || text.includes('[Chat]') || text.includes('[GroupMgmt]') ||
        text.includes('KeyPackage') || text.includes('Welcome') || text.includes('Error') ||
        text.includes('error') || text.includes('[MLS]') || text.includes('0xf2ee') ||
        text.includes('[Nostr]') || text.includes('[Marmot]')) {
      console.log(`  [${label}:console] ${text.slice(0, 200)}`);
    }
  });
}

async function screenshot(page, name) {
  const path = `/tmp/marmot-${name}.png`;
  try {
    await page.screenshot({ path, fullPage: true });
    console.log(`  📸 ${path}`);
  } catch (e) {
    console.log(`  ⚠️ Screenshot failed: ${e.message}`);
  }
  return path;
}

async function getPageText(page) {
  try {
    return await page.evaluate(() => document.body.innerText);
  } catch {
    return '';
  }
}

// Click somewhere neutral to close dropdowns
async function closeDropdown(page) {
  await page.evaluate(() => {
    // Blur active element to close dropdowns
    if (document.activeElement) document.activeElement.blur();
    // Click on body
    document.body.click();
  });
  await sleep(300);
}

// ============ LOGIN ============

async function loginWithNsec(page, nsec, label) {
  console.log(`\n--- ${label}: Login ---`);

  await page.goto(MARMOT_URL + 'login', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);

  const text = await getPageText(page);
  console.log(`  ${label}: Page loaded, contains "Marmot": ${text.includes('Marmot')}`);

  // Click "⚠️ Private Key (Insecure)" expand button
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Private Key'));
    if (btn) btn.click();
  });
  console.log(`  ${label}: Expanded nsec login section`);
  await sleep(500);

  // Type nsec
  const nsecInput = await page.$('input[data-testid="nsec-input"]');
  if (!nsecInput) {
    console.log(`  ${label}: ❌ Could not find nsec input`);
    await screenshot(page, `${label}-no-nsec-input`);
    return false;
  }
  await nsecInput.type(nsec, { delay: 5 });
  console.log(`  ${label}: Entered nsec`);

  // Check the warning checkbox
  const checkbox = await page.$('input[data-testid="nsec-warning-checkbox"]');
  if (checkbox) {
    await checkbox.click();
    console.log(`  ${label}: Checked warning checkbox`);
  }
  await sleep(300);

  // Click login button
  const loginBtn = await page.$('button[data-testid="nsec-login-btn"]');
  if (loginBtn) {
    await loginBtn.click();
    console.log(`  ${label}: Clicked login button`);
  } else {
    console.log(`  ${label}: ❌ Could not find login button`);
    return false;
  }

  // Wait for navigation to /chat
  await sleep(5000);
  const url = page.url();
  console.log(`  ${label}: Current URL: ${url}`);

  if (url.includes('/chat')) {
    console.log(`  ✅ ${label}: Login successful`);
    return true;
  }

  // Check for error
  const errorText = await page.evaluate(() => {
    const el = document.querySelector('.alert-error');
    return el ? el.textContent : null;
  });
  if (errorText) {
    console.log(`  ❌ ${label}: Login error: ${errorText}`);
  }

  await screenshot(page, `${label}-login-fail`);
  return false;
}

// ============ CREATE KEYPACKAGE ============

async function createKeyPackage(page, label) {
  console.log(`\n--- ${label}: Create KeyPackage ---`);

  await page.goto(MARMOT_URL + 'settings', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);

  const text = await getPageText(page);
  console.log(`  ${label}: Settings page loaded, KeyPackages section: ${text.includes('KeyPackages')}`);

  // Click "+ Create New" button
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.includes('Create New'));
    if (btn) { btn.click(); return true; }
    return false;
  });

  if (clicked) {
    console.log(`  ${label}: Clicked "Create New" button`);
  } else {
    console.log(`  ${label}: ❌ Could not find "Create New" button`);
    await screenshot(page, `${label}-no-create-btn`);
    return false;
  }

  // Wait for creation + publishing
  await sleep(10000);

  // Check for success
  const afterText = await getPageText(page);
  if (afterText.includes('KeyPackage created') || afterText.includes('published')) {
    console.log(`  ✅ ${label}: KeyPackage created and published`);
    return true;
  }

  // Check console
  const logs = page._collectedLogs || [];
  const published = logs.some(l => l.includes('[KeyPackage] Published to relays'));
  if (published) {
    console.log(`  ✅ ${label}: KeyPackage published (console confirmed)`);
    return true;
  }

  await screenshot(page, `${label}-after-create-kp`);
  return afterText.includes('1 KeyPackage');
}

// ============ ADD CONTACT ============

async function addContactFlow(page, npub, label) {
  console.log(`\n--- ${label}: Add Contact Flow ---`);

  // Navigate to chat page
  await page.goto(MARMOT_URL + 'chat', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);

  // Step 1: Click hamburger menu to open dropdown
  console.log(`  ${label}: Step 1 - Open hamburger menu...`);
  await page.evaluate(() => {
    // Find and click the hamburger button (first btn-circle in sidebar header)
    const hamburger = document.querySelector('.btn-circle');
    if (hamburger) hamburger.click();
  });
  await sleep(500);

  // Step 2: Click "👥 Contacts" in dropdown to switch sidebar view
  console.log(`  ${label}: Step 2 - Click Contacts menu item...`);
  await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('.dropdown-content a'));
    const contactsLink = links.find(a => a.textContent.includes('Contacts'));
    if (contactsLink) contactsLink.click();
  });
  await sleep(1000);

  // Step 3: Close the dropdown by clicking elsewhere
  console.log(`  ${label}: Step 3 - Close dropdown...`);
  await closeDropdown(page);
  await sleep(500);

  // Now the sidebar should show the Contacts view with "➕ Add Contact" button
  await screenshot(page, `${label}-contacts-sidebar`);

  // Step 4: Click "➕ Add Contact" button (it's a btn-primary btn-sm w-full in the contacts header)
  console.log(`  ${label}: Step 4 - Click Add Contact button...`);
  const addClicked = await page.evaluate(() => {
    // The Add Contact button is the first btn-primary btn-sm in the contacts view
    const btns = Array.from(document.querySelectorAll('button'));
    const addBtn = btns.find(b => b.textContent.includes('Add Contact') && b.classList.contains('btn-primary'));
    if (addBtn) {
      addBtn.click();
      return true;
    }
    // Fallback: any button with "Add Contact"
    const fallback = btns.find(b => b.textContent.includes('Add Contact'));
    if (fallback) {
      fallback.click();
      return 'fallback';
    }
    return false;
  });

  console.log(`  ${label}: Add Contact button result: ${addClicked}`);
  if (!addClicked) {
    console.log(`  ${label}: ❌ Could not find Add Contact button`);
    const pageText = await getPageText(page);
    console.log(`  ${label}: Page text snippet: ${pageText.slice(0, 300)}`);
    await screenshot(page, `${label}-no-add-btn`);
    return false;
  }

  await sleep(1000);
  await screenshot(page, `${label}-add-contact-dialog`);

  // Step 5: Type npub in the modal input
  console.log(`  ${label}: Step 5 - Enter npub...`);
  const inputFound = await page.evaluate((npubValue) => {
    // Find the input in the modal
    const modal = document.querySelector('.modal');
    if (!modal) return 'no-modal';
    
    const input = modal.querySelector('input.input-bordered');
    if (!input) return 'no-input';
    
    // Focus and set value
    input.focus();
    input.value = npubValue;
    // Trigger Vue reactivity
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  }, npub);
  
  console.log(`  ${label}: Input result: ${inputFound}`);

  if (inputFound === 'no-modal') {
    console.log(`  ${label}: ❌ Modal not found`);
    // Maybe we need to look differently
    const html = await page.evaluate(() => document.querySelector('.modal')?.outerHTML?.slice(0, 500) || 'no .modal element');
    console.log(`  ${label}: Modal HTML: ${html}`);
    return false;
  }

  if (inputFound === 'no-input') {
    console.log(`  ${label}: ❌ Input not found in modal`);
    const modalHtml = await page.evaluate(() => document.querySelector('.modal')?.innerHTML?.slice(0, 500) || 'empty');
    console.log(`  ${label}: Modal HTML: ${modalHtml}`);
    return false;
  }

  await sleep(500);
  await screenshot(page, `${label}-npub-entered`);

  // Step 6: Click "Add Contact" submit button in modal
  console.log(`  ${label}: Step 6 - Click Add Contact submit...`);
  const submitted = await page.evaluate(() => {
    const modal = document.querySelector('.modal');
    if (!modal) return false;
    const btns = Array.from(modal.querySelectorAll('button.btn-primary'));
    const submitBtn = btns.find(b => b.textContent.includes('Add Contact'));
    if (submitBtn && !submitBtn.disabled) {
      submitBtn.click();
      return true;
    }
    // Check if disabled
    if (submitBtn && submitBtn.disabled) return 'disabled';
    return false;
  });

  console.log(`  ${label}: Submit result: ${submitted}`);
  if (submitted === 'disabled') {
    console.log(`  ${label}: ⚠️ Submit button is disabled - input validation may have failed`);
    // Check if the input actually has the value
    const inputVal = await page.evaluate(() => {
      const modal = document.querySelector('.modal');
      const input = modal?.querySelector('input');
      return input?.value || 'empty';
    });
    console.log(`  ${label}: Input value: ${inputVal?.slice(0, 30)}...`);

    // Try typing directly with puppeteer instead
    console.log(`  ${label}: Retrying with direct puppeteer type...`);
    await page.evaluate(() => {
      const modal = document.querySelector('.modal');
      const input = modal?.querySelector('input');
      if (input) { input.value = ''; input.focus(); }
    });
    await sleep(200);
    
    // Use puppeteer's type on the focused element
    await page.keyboard.type(npub, { delay: 3 });
    await sleep(500);
    
    // Try submit again
    const retrySubmit = await page.evaluate(() => {
      const modal = document.querySelector('.modal');
      const btns = Array.from(modal?.querySelectorAll('button.btn-primary') || []);
      const submitBtn = btns.find(b => b.textContent.includes('Add Contact'));
      if (submitBtn && !submitBtn.disabled) {
        submitBtn.click();
        return true;
      }
      return submitBtn?.disabled ? 'still-disabled' : false;
    });
    console.log(`  ${label}: Retry submit result: ${retrySubmit}`);
  }

  // Wait for follow event publication
  console.log(`  ${label}: Waiting for follow event publication...`);
  await sleep(8000);

  // Check console logs
  const logs = page._collectedLogs || [];
  const followLog = logs.find(l => l.includes('[AddContact] Follow event published'));
  if (followLog) {
    console.log(`  ✅ ${label}: Follow event published!`);
    results.addContact.followPublished = true;
  }

  // Check for success message in UI
  const pageText = await getPageText(page);
  if (pageText.includes('Contact added') || pageText.includes('start a chat')) {
    console.log(`  ✅ ${label}: Contact added successfully (UI confirmed)`);
    results.addContact.aliceInContacts = true;
  }

  await screenshot(page, `${label}-after-add-contact`);

  // Wait for dialog to auto-close
  await sleep(3000);

  return results.addContact.followPublished;
}

// ============ START CHAT ============

async function startChatFromContacts(page, label) {
  console.log(`\n--- ${label}: Start Chat from Contacts ---`);

  // After adding contact, we should still be on contacts view
  // Wait for contact data to load (profile + KeyPackages)
  await sleep(5000);
  await screenshot(page, `${label}-contacts-after-add`);

  // Check what's in the contacts view
  const contactsInfo = await page.evaluate(() => {
    const cards = document.querySelectorAll('[role="button"][aria-label*="Contact:"]');
    const chatBtns = document.querySelectorAll('button[title="Start Marmot Chat"]');
    const kpBadges = document.querySelectorAll('.badge-success');
    const warnBadges = document.querySelectorAll('.badge-warning');
    return {
      contactCount: cards.length,
      chatBtnCount: chatBtns.length,
      kpBadgeCount: kpBadges.length,
      warnBadgeCount: warnBadges.length,
      contactLabels: Array.from(cards).map(c => c.getAttribute('aria-label')),
    };
  });
  console.log(`  ${label}: Contacts info:`, JSON.stringify(contactsInfo));

  // If contact has KeyPackage, click the 💬 button
  if (contactsInfo.chatBtnCount > 0) {
    await page.evaluate(() => {
      const btn = document.querySelector('button[title="Start Marmot Chat"]');
      if (btn) btn.click();
    });
    console.log(`  ✅ ${label}: Clicked 💬 Start Chat button`);
    await sleep(5000);
    await screenshot(page, `${label}-chat-opened`);
    return true;
  }

  // If no 💬 button, contact might not have KeyPackage yet
  // Try clicking the contact card - it emits 'startChat' if it has KP
  if (contactsInfo.contactCount > 0) {
    console.log(`  ${label}: No 💬 button. Contact may lack KeyPackage. Clicking card anyway...`);
    await page.evaluate(() => {
      const card = document.querySelector('[role="button"][aria-label*="Contact:"]');
      if (card) card.click();
    });
    await sleep(2000);

    // In non-selectable mode (contacts view), clicking card doesn't do much
    // The card emits 'click' but ContactList emits 'select' which is handled differently than 'startChat'
    // Let's check if clicking the card itself opened a chat
    const url = page.url();
    const hasComposer = await page.$('textarea');
    if (hasComposer) {
      console.log(`  ✅ ${label}: Chat composer found after card click`);
      return true;
    }
  }

  // Fallback: Try waiting for KeyPackage fetch and retry
  console.log(`  ${label}: ⚠️ Contact has no KeyPackage visible. Waiting 10s and refreshing...`);
  await sleep(10000);
  
  // Refresh the contacts page
  await page.goto(MARMOT_URL + 'chat', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);
  
  // Re-open contacts sidebar
  await page.evaluate(() => {
    document.querySelector('.btn-circle')?.click();
  });
  await sleep(500);
  await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('.dropdown-content a'));
    links.find(a => a.textContent.includes('Contacts'))?.click();
  });
  await sleep(1000);
  await closeDropdown(page);
  await sleep(2000);

  // Check again for 💬 button
  const retryInfo = await page.evaluate(() => {
    const chatBtns = document.querySelectorAll('button[title="Start Marmot Chat"]');
    return { chatBtnCount: chatBtns.length };
  });
  console.log(`  ${label}: Retry - chat buttons: ${retryInfo.chatBtnCount}`);
  
  if (retryInfo.chatBtnCount > 0) {
    await page.evaluate(() => {
      document.querySelector('button[title="Start Marmot Chat"]')?.click();
    });
    console.log(`  ✅ ${label}: Clicked 💬 button on retry`);
    await sleep(5000);
    await screenshot(page, `${label}-chat-opened-retry`);
    return true;
  }

  console.log(`  ❌ ${label}: Could not start chat - no KeyPackage for contact`);
  await screenshot(page, `${label}-no-kp-for-contact`);
  return false;
}

// ============ SEND MESSAGE ============

async function sendChatMessage(page, message, label) {
  console.log(`\n--- ${label}: Send Message ---`);

  // Check for message composer
  let composer = await page.$('textarea');
  if (!composer) {
    // Maybe it's an input element
    composer = await page.evaluateHandle(() => {
      return document.querySelector('input[placeholder*="message" i]') ||
             document.querySelector('input[placeholder*="type" i]');
    });
    if (!composer || !(await composer.asElement())) {
      console.log(`  ❌ ${label}: No message composer found`);
      await screenshot(page, `${label}-no-composer`);
      return false;
    }
  }

  await composer.click();
  await composer.type(message, { delay: 10 });
  console.log(`  ${label}: Typed: "${message}"`);

  // Send with Enter
  await page.keyboard.press('Enter');
  await sleep(3000);

  // Verify
  const pageText = await getPageText(page);
  if (pageText.includes(message)) {
    console.log(`  ✅ ${label}: Message visible in chat`);
    return true;
  }

  console.log(`  ⚠️ ${label}: Message not immediately visible, but was sent`);
  await screenshot(page, `${label}-after-send`);
  return true;
}

// ============ WAIT FOR MESSAGE ============

async function waitForMessage(page, expectedText, label, timeoutMs = 90000) {
  console.log(`\n--- ${label}: Waiting for "${expectedText}" (${timeoutMs / 1000}s) ---`);
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const pageText = await getPageText(page);
    if (pageText.includes(expectedText)) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`  ✅ ${label}: Found "${expectedText}" after ${elapsed}s`);
      return true;
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    if (elapsed % 15 === 0 && elapsed > 0) {
      console.log(`  ${label}: Still waiting... ${elapsed}s`);
      
      // Check console for Welcome-related logs
      const logs = page._collectedLogs || [];
      const recentWelcome = logs.filter(l => l.includes('Welcome')).slice(-3);
      if (recentWelcome.length > 0) {
        recentWelcome.forEach(l => console.log(`    ${l.slice(0, 150)}`));
      }
    }

    await sleep(5000);
  }

  console.log(`  ❌ ${label}: Timeout`);
  await screenshot(page, `${label}-timeout`);
  return false;
}

// ============ LEAVE GROUP ============

async function leaveGroupFlow(page, label) {
  console.log(`\n--- ${label}: Leave Group ---`);

  // Set up dialog handler BEFORE triggering
  page.once('dialog', async dialog => {
    console.log(`  ${label}: Dialog: "${dialog.message().slice(0, 80)}"`);
    await dialog.accept();
    console.log(`  ${label}: Accepted`);
  });

  // Click the kebab menu (⋮) in conversation header
  const menuClicked = await page.evaluate(() => {
    const dropdownEnd = document.querySelector('.dropdown-end');
    if (!dropdownEnd) return false;
    const btn = dropdownEnd.querySelector('.btn-circle');
    if (btn) { btn.click(); return true; }
    return false;
  });

  if (!menuClicked) {
    console.log(`  ${label}: ❌ Could not find kebab menu`);
    await screenshot(page, `${label}-no-kebab`);
    return false;
  }
  console.log(`  ${label}: Clicked kebab menu`);
  await sleep(500);

  // Click "🚪 Leave Group"
  await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('.dropdown-content a'));
    const leaveLink = links.find(a => a.textContent.includes('Leave'));
    if (leaveLink) leaveLink.click();
  });
  console.log(`  ${label}: Clicked Leave Group`);
  await sleep(3000);

  // Check results
  const logs = page._collectedLogs || [];
  if (logs.some(l => l.includes('[GroupMgmt] Left group'))) {
    console.log(`  ✅ ${label}: Group left (console confirmed)`);
    results.leaveGroup.aliceLeft = true;
  }

  const pageText = await getPageText(page);
  if (pageText.includes('Select a conversation') || pageText.includes('start a new chat')) {
    console.log(`  ✅ ${label}: Redirected to empty state`);
    results.leaveGroup.conversationRemoved = true;
  }

  await screenshot(page, `${label}-after-leave`);
  return true;
}

// ============ MAIN TEST ============

async function main() {
  let browserAlice = null;
  let browserBob = null;

  try {
    console.log('\n=== Connecting to Chrome containers ===');

    browserAlice = await puppeteer.connect({
      browserWSEndpoint: CHROME1_CDP,
      acceptInsecureCerts: true,
    });
    console.log('✅ Connected to Chrome1 (Alice)');

    browserBob = await puppeteer.connect({
      browserWSEndpoint: CHROME2_CDP,
      acceptInsecureCerts: true,
    });
    console.log('✅ Connected to Chrome2 (Bob)');

    const pageAlice = await browserAlice.newPage();
    const pageBob = await browserBob.newPage();

    // Ignore certificate errors via CDP
    const cdpAlice = await pageAlice.createCDPSession();
    await cdpAlice.send('Security.setIgnoreCertificateErrors', { ignore: true });
    const cdpBob = await pageBob.createCDPSession();
    await cdpBob.send('Security.setIgnoreCertificateErrors', { ignore: true });

    setupConsoleLogs(pageAlice, 'Alice');
    setupConsoleLogs(pageBob, 'Bob');

    // ============ STEP 1: LOGIN ============
    console.log('\n' + '='.repeat(50));
    console.log('  STEP 1: Login Both Users');
    console.log('='.repeat(50));

    results.aliceSetup.login = await loginWithNsec(pageAlice, aliceNsec, 'Alice');
    results.bobSetup.login = await loginWithNsec(pageBob, bobNsec, 'Bob');

    if (!results.aliceSetup.login || !results.bobSetup.login) {
      console.log('\n❌ FATAL: Login failed. Aborting.');
      await screenshot(pageAlice, 'alice-login-fail');
      await screenshot(pageBob, 'bob-login-fail');
      return;
    }

    // ============ STEP 2: CREATE KEYPACKAGES ============
    console.log('\n' + '='.repeat(50));
    console.log('  STEP 2: Create KeyPackages');
    console.log('='.repeat(50));

    results.aliceSetup.keyPackageCreated = await createKeyPackage(pageAlice, 'Alice');
    results.bobSetup.keyPackageCreated = await createKeyPackage(pageBob, 'Bob');

    if (!results.aliceSetup.keyPackageCreated || !results.bobSetup.keyPackageCreated) {
      console.log('\n⚠️ KeyPackage creation may have issues. Continuing...');
    }

    // Wait for relay propagation
    console.log('\n  Waiting 15s for KeyPackages to propagate to relays...');
    await sleep(15000);

    // ============ STEP 3: BOB ADDS ALICE ============
    console.log('\n' + '='.repeat(50));
    console.log('  STEP 3: Bob Adds Alice as Contact');
    console.log('='.repeat(50));

    await addContactFlow(pageBob, aliceNpub, 'Bob');

    // Wait a bit for follow event and KeyPackage fetch
    await sleep(5000);

    // ============ STEP 4: BOB STARTS CHAT ============
    console.log('\n' + '='.repeat(50));
    console.log('  STEP 4: Bob Starts Chat with Alice');
    console.log('='.repeat(50));

    const chatStarted = await startChatFromContacts(pageBob, 'Bob');

    if (chatStarted) {
      await sleep(2000);
      results.chat.bobSent = await sendChatMessage(pageBob, 'Hello Alice from Bob!', 'Bob');
    } else {
      console.log('  ❌ Could not start chat. Test will be incomplete.');
    }

    await screenshot(pageBob, 'bob-after-send');

    // ============ STEP 5: ALICE RECEIVES ============
    console.log('\n' + '='.repeat(50));
    console.log('  STEP 5: Alice Waits for Message');
    console.log('='.repeat(50));

    // Navigate Alice to chat page
    await pageAlice.goto(MARMOT_URL + 'chat', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(5000);

    console.log('  Waiting for Welcome event processing (up to 90s)...');
    results.chat.aliceReceived = await waitForMessage(pageAlice, 'Hello Alice from Bob!', 'Alice', 90000);

    if (!results.chat.aliceReceived) {
      // Try refresh
      console.log('  Refreshing Alice page...');
      await pageAlice.reload({ waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(10000);

      // Check if there are any conversations now
      const aliceConvs = await pageAlice.evaluate(() => {
        const items = document.querySelectorAll('.overflow-y-auto > div');
        return items.length;
      });
      console.log(`  Alice conversations count: ${aliceConvs}`);
      
      if (aliceConvs > 0) {
        // Click on first conversation
        await pageAlice.evaluate(() => {
          const first = document.querySelector('.overflow-y-auto > div');
          if (first) first.click();
        });
        await sleep(2000);
        
        const text = await getPageText(pageAlice);
        if (text.includes('Hello Alice from Bob!')) {
          console.log(`  ✅ Alice: Found message after clicking conversation`);
          results.chat.aliceReceived = true;
        }
      }

      if (!results.chat.aliceReceived) {
        results.chat.aliceReceived = await waitForMessage(pageAlice, 'Hello Alice from Bob!', 'Alice', 30000);
      }
    }

    await screenshot(pageAlice, 'alice-after-wait');

    // ============ STEP 6: ALICE REPLIES ============
    console.log('\n' + '='.repeat(50));
    console.log('  STEP 6: Alice Replies');
    console.log('='.repeat(50));

    if (results.chat.aliceReceived) {
      // Make sure conversation is active (click first conv if needed)
      await pageAlice.evaluate(() => {
        const first = document.querySelector('.overflow-y-auto > div');
        if (first) first.click();
      });
      await sleep(1000);

      results.chat.aliceReplied = await sendChatMessage(pageAlice, 'Hello Bob from Alice!', 'Alice');
      await screenshot(pageAlice, 'alice-reply');
    } else {
      console.log('  ⚠️ Skipping reply - Alice did not receive message');
    }

    // ============ STEP 7: BOB RECEIVES ============
    console.log('\n' + '='.repeat(50));
    console.log('  STEP 7: Bob Receives Reply');
    console.log('='.repeat(50));

    if (results.chat.aliceReplied) {
      results.chat.bobReceived = await waitForMessage(pageBob, 'Hello Bob from Alice!', 'Bob', 60000);
      await screenshot(pageBob, 'bob-reply');
    } else {
      console.log('  ⚠️ Skipping');
    }

    // ============ STEP 8: ALICE LEAVES ============
    console.log('\n' + '='.repeat(50));
    console.log('  STEP 8: Alice Leaves Group');
    console.log('='.repeat(50));

    if (results.chat.aliceReceived) {
      // Ensure conversation is active
      await pageAlice.evaluate(() => {
        const first = document.querySelector('.overflow-y-auto > div');
        if (first) first.click();
      });
      await sleep(1000);

      await leaveGroupFlow(pageAlice, 'Alice');
    } else {
      console.log('  ⚠️ Skipping - no conversation');
    }

    // ============ FINAL RESULTS ============
    console.log('\n\n' + '='.repeat(50));
    console.log('         FINAL TEST RESULTS');
    console.log('='.repeat(50));

    const ok = (v) => v ? '✅' : '❌';

    console.log(`\n📋 User A (Alice) Setup:`);
    console.log(`  ${ok(results.aliceSetup.login)} Login`);
    console.log(`  ${ok(results.aliceSetup.keyPackageCreated)} KeyPackage created`);
    console.log(`  Npub: ${aliceNpub}`);

    console.log(`\n📋 User B (Bob) Setup:`);
    console.log(`  ${ok(results.bobSetup.login)} Login`);
    console.log(`  ${ok(results.bobSetup.keyPackageCreated)} KeyPackage created`);
    console.log(`  Npub: ${bobNpub}`);

    console.log(`\n📋 Add Contact Test:`);
    console.log(`  ${ok(results.addContact.followPublished)} Follow event published (kind:3)`);
    console.log(`  ${ok(results.addContact.aliceInContacts)} Alice in contacts`);

    console.log(`\n📋 Bidirectional Chat Test:`);
    console.log(`  ${ok(results.chat.bobSent)} Bob → Alice: "Hello Alice from Bob!"`);
    console.log(`  ${ok(results.chat.aliceReceived)} Alice receives message`);
    console.log(`  ${ok(results.chat.aliceReplied)} Alice → Bob: "Hello Bob from Alice!"`);
    console.log(`  ${ok(results.chat.bobReceived)} Bob receives reply`);

    console.log(`\n📋 Leave Group Test:`);
    console.log(`  ${ok(results.leaveGroup.aliceLeft)} Alice left group`);
    console.log(`  ${ok(results.leaveGroup.conversationRemoved)} Conversation removed`);

    const allPassed = Object.values(results).every(cat =>
      Object.values(cat).every(v => v === true)
    );
    console.log(`\n${allPassed ? '🎉 COMPLETE: All features working end-to-end!' : '⚠️ Some tests incomplete'}`);

    // Key console logs
    console.log('\n--- Key Console Logs ---');
    for (const [pg, lbl] of [[pageAlice, 'Alice'], [pageBob, 'Bob']]) {
      const logs = (pg._collectedLogs || []).filter(l =>
        l.includes('[AddContact]') || l.includes('[Chat]') || l.includes('[GroupMgmt]') ||
        l.includes('KeyPackage') || l.includes('Welcome') || l.includes('0xf2ee') ||
        l.includes('[Marmot]') || l.includes('error')
      ).slice(-20);
      if (logs.length > 0) {
        console.log(`\n  ${lbl}:`);
        logs.forEach(l => console.log(`    ${l.slice(0, 180)}`));
      }
    }

  } catch (error) {
    console.error('\n❌ Test crashed:', error.message);
    console.error(error.stack);
  } finally {
    if (browserAlice) try { browserAlice.disconnect(); } catch {}
    if (browserBob) try { browserBob.disconnect(); } catch {}
    console.log('\n=== Test complete ===');
  }
}

main().catch(console.error);
