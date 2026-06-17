import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ts = () => Date.now();

async function registerAndLogin(page, { email, username, password }) {
  await page.goto('/register');
  await page.fill('input[type="email"]',                            email);
  await page.fill('input[placeholder="3–20 chars, letters/numbers/_"]', username);

  // password field (first pwWrapper)
  const pwInputs = page.locator('input[type="password"], input[placeholder="At least 8 characters"]');
  await pwInputs.first().fill(password);

  // confirm password field
  const confirmInput = page.locator('input[placeholder="Repeat password"]');
  await confirmInput.fill(password);

  await page.click('button[type="submit"]');
  await page.waitForURL('/');
}

async function loginViaUI(page, { identifier, password }) {
  await page.goto('/login');
  await page.fill('input[placeholder="Email or username"]', identifier);
  await page.fill('input[placeholder="Password"]',          password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
}

// ---------------------------------------------------------------------------
// Login page — rendering
// ---------------------------------------------------------------------------

test.describe('Login page — rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('shows Email or username placeholder (not email-only)', async ({ page }) => {
    const input = page.locator('input[placeholder="Email or username"]');
    await expect(input).toBeVisible();
  });

  test('identifier input is type text, not email', async ({ page }) => {
    const input = page.locator('input[placeholder="Email or username"]');
    await expect(input).toHaveAttribute('type', 'text');
  });

  test('password field is hidden by default', async ({ page }) => {
    const pw = page.locator('input[placeholder="Password"]');
    await expect(pw).toHaveAttribute('type', 'password');
  });

  test('show/hide password toggle switches field visibility', async ({ page }) => {
    const pw     = page.locator('input[placeholder="Password"]');
    const toggle = page.locator('button[aria-label="Show password"]');

    await expect(pw).toHaveAttribute('type', 'password');
    await toggle.click();
    await expect(pw).toHaveAttribute('type', 'text');
    await page.locator('button[aria-label="Hide password"]').click();
    await expect(pw).toHaveAttribute('type', 'password');
  });

  test('Google sign-in button is visible and contains SVG icon', async ({ page }) => {
    const googleBtn = page.locator('button', { hasText: 'Sign in with Google' });
    await expect(googleBtn).toBeVisible();
    await expect(googleBtn.locator('svg')).toBeVisible();
  });

  test('link to register page is present', async ({ page }) => {
    await expect(page.locator('a[href="/register"]')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Login — functional
// ---------------------------------------------------------------------------

test.describe('Login — functional', () => {
  let email, username, password;

  test.beforeAll(async ({ browser }) => {
    const n  = ts();
    email    = `pw_${n}@example.com`;
    username = `user${n}`;
    password = 'TestPass123!';
    const page = await browser.newPage();
    await registerAndLogin(page, { email, username, password });
    await page.close();
  });

  test('login with email redirects to dashboard', async ({ page }) => {
    await loginViaUI(page, { identifier: email, password });
    await expect(page).toHaveURL('/');
  });

  test('login with username redirects to dashboard', async ({ page }) => {
    await loginViaUI(page, { identifier: username, password });
    await expect(page).toHaveURL('/');
  });

  test('wrong password shows error banner', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[placeholder="Email or username"]', email);
    await page.fill('input[placeholder="Password"]',          'WrongPass!');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });

  test('unknown identifier shows error banner', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[placeholder="Email or username"]', 'nobody@example.com');
    await page.fill('input[placeholder="Password"]',          password);
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Register page — rendering
// ---------------------------------------------------------------------------

test.describe('Register page — rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  test('username field is present and required', async ({ page }) => {
    const usernameInput = page.locator('input[placeholder="3–20 chars, letters/numbers/_"]');
    await expect(usernameInput).toBeVisible();
    await expect(usernameInput).toHaveAttribute('required', '');
  });

  test('password fields have show/hide toggles', async ({ page }) => {
    const toggles = page.locator('button[aria-label="Show password"]');
    await expect(toggles).toHaveCount(2);
  });

  test('submitting without username shows error', async ({ page }) => {
    await page.fill('input[type="email"]',            'test@example.com');
    await page.fill('input[placeholder="At least 8 characters"]', 'TestPass123!');
    await page.fill('input[placeholder="Repeat password"]',        'TestPass123!');
    // Do NOT fill username — submit and expect validation
    await page.click('button[type="submit"]');
    // Browser native validation on required field prevents submission; username field gets focus
    const usernameInput = page.locator('input[placeholder="3–20 chars, letters/numbers/_"]');
    await expect(usernameInput).toBeFocused();
  });

  test('submitting with invalid username shows error banner', async ({ page }) => {
    const n = ts();
    await page.fill('input[type="email"]',                              `inv_${n}@example.com`);
    await page.fill('input[placeholder="3–20 chars, letters/numbers/_"]', 'ab'); // too short
    await page.fill('input[placeholder="At least 8 characters"]',         'TestPass123!');
    await page.fill('input[placeholder="Repeat password"]',                'TestPass123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Username must be')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Register — functional
// ---------------------------------------------------------------------------

test.describe('Register — functional', () => {
  test('successful registration redirects to dashboard', async ({ page }) => {
    const n = ts();
    await page.goto('/register');
    await page.fill('input[type="email"]',                              `reg_${n}@example.com`);
    await page.fill('input[placeholder="3–20 chars, letters/numbers/_"]', `reg${n}`);
    await page.fill('input[placeholder="At least 8 characters"]',         'TestPass123!');
    await page.fill('input[placeholder="Repeat password"]',                'TestPass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });

  test('duplicate email shows error', async ({ page }) => {
    const n   = ts();
    const email = `dup_${n}@example.com`;
    const uname = `dup${n}`;
    // First registration
    await registerAndLogin(page, { email, username: uname, password: 'TestPass123!' });
    // Logout
    await page.locator('button', { hasText: 'Logout' }).first().click();
    await page.locator('.confirm-logout, button', { hasText: 'Logout' }).last().click();
    await page.waitForURL('/login');
    // Attempt duplicate
    await page.goto('/register');
    await page.fill('input[type="email"]',                              email);
    await page.fill('input[placeholder="3–20 chars, letters/numbers/_"]', `${uname}2`);
    await page.fill('input[placeholder="At least 8 characters"]',         'TestPass123!');
    await page.fill('input[placeholder="Repeat password"]',                'TestPass123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=already registered')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Logout confirmation modal
// ---------------------------------------------------------------------------

test.describe('Logout confirmation modal', () => {
  let email, username, password;

  test.beforeAll(async ({ browser }) => {
    const n  = ts();
    email    = `logout_${n}@example.com`;
    username = `logout${n}`;
    password = 'TestPass123!';
    const page = await browser.newPage();
    await registerAndLogin(page, { email, username, password });
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, { identifier: email, password });
  });

  test('clicking Logout opens confirmation modal', async ({ page }) => {
    await page.locator('nav button', { hasText: 'Logout' }).click();
    await expect(page.locator('text=Confirm Logout')).toBeVisible();
    await expect(page.locator('text=Are you sure you want to log out?')).toBeVisible();
  });

  test('Cancel button dismisses the modal without logging out', async ({ page }) => {
    await page.locator('nav button', { hasText: 'Logout' }).click();
    await expect(page.locator('text=Confirm Logout')).toBeVisible();
    await page.locator('button', { hasText: 'Cancel' }).click();
    await expect(page.locator('text=Confirm Logout')).not.toBeVisible();
    await expect(page).toHaveURL('/');
  });

  test('clicking overlay dismisses the modal', async ({ page }) => {
    await page.locator('nav button', { hasText: 'Logout' }).click();
    await expect(page.locator('text=Confirm Logout')).toBeVisible();
    // Click the overlay backdrop (outside the modal card)
    await page.mouse.click(10, 10);
    await expect(page.locator('text=Confirm Logout')).not.toBeVisible();
  });

  test('confirming logout redirects to login page', async ({ page }) => {
    await page.locator('nav button', { hasText: 'Logout' }).click();
    await expect(page.locator('text=Confirm Logout')).toBeVisible();
    // The modal Logout button is the last one in DOM
    await page.locator('button', { hasText: 'Logout' }).last().click();
    await page.waitForURL('/login');
    await expect(page).toHaveURL('/login');
  });
});
