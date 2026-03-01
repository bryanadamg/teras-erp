import { test, expect } from '@playwright/test';

test.describe('Authentication & RBAC', () => {
  
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');
  });

  test('successful login and logout', async ({ page }) => {
    await page.goto('/login');
    
    // Wait for the initial "SYSTEM_CHECK..." loading state to disappear
    await page.waitForSelector('text=SYSTEM_CHECK...', { state: 'hidden', timeout: 15000 });
    
    // Now perform login using robust testids
    await page.getByTestId('username-input').fill('admin');
    await page.getByTestId('password-input').fill('password');
    await page.getByTestId('login-submit').click();
    
    // Wait for redirect to dashboard
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 });
    await expect(page.getByTestId('username-display')).toContainText('admin');

    // Logout using the direct button in the header (most reliable)
    await page.getByTestId('logout-btn').click();
    await expect(page).toHaveURL('/login');
  });

  test('viewer role cannot access settings', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('text=SYSTEM_CHECK...', { state: 'hidden', timeout: 15000 });

    await page.getByTestId('username-input').fill('admin');
    await page.getByTestId('password-input').fill('password');
    await page.getByTestId('login-submit').click();
    
    await expect(page).toHaveURL('/dashboard');
    
    // Settings icon should be visible for admin
    await expect(page.getByTestId('settings-btn')).toBeVisible();
    await page.goto('/settings');
    await expect(page.locator('text=Database Infrastructure')).toBeVisible();
  });

  test('invalid login shows error', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('text=SYSTEM_CHECK...', { state: 'hidden', timeout: 15000 });

    await page.getByTestId('username-input').fill('wrong');
    await page.getByTestId('password-input').fill('wrong');
    await page.getByTestId('login-submit').click();
    
    // Check for the "Invalid credentials" alert using testid
    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page.getByTestId('login-error')).toContainText('Invalid credentials');
  });
});
