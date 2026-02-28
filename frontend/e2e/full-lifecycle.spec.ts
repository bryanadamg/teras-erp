import { test, expect } from '@playwright/test';

test('Full ERP Lifecycle: Buy, Make, Sell', async ({ page }) => {
  // 1. LOGIN
  await page.goto('/login');
  await page.fill('input[placeholder="Username"]', 'admin');
  await page.fill('input[placeholder="Password"]', 'admin123');
  await page.click('button:has-text("Sign In")');
  await expect(page).toHaveURL('/dashboard');

  // --- UNIQUE IDENTIFIERS (to allow repeated runs) ---
  const timestamp = Date.now();
  const supplierName = `Supplier-${timestamp}`;
  const customerName = `Customer-${timestamp}`;
  const rmA = `RM-A-${timestamp}`;
  const rmB = `RM-B-${timestamp}`;
  const fgX = `FG-X-${timestamp}`;
  const poNum = `PO-${timestamp}`;
  const soNum = `SO-${timestamp}`;

  // 2. SETUP PARTNERS
  await page.goto('/suppliers');
  await page.click('button:has-text("Add Supplier")');
  await page.fill('input[placeholder*="supplier name"]', supplierName);
  await page.click('button:has-text("CREATE SUPPLIER")');
  await expect(page.locator(`text=${supplierName}`)).toBeVisible();

  await page.goto('/customers');
  await page.click('button:has-text("Add Customer")');
  await page.fill('input[placeholder*="customer name"]', customerName);
  await page.click('button:has-text("CREATE CUSTOMER")');
  await expect(page.locator(`text=${customerName}`)).toBeVisible();

  // 3. INVENTORY (Raw Materials & FG)
  await page.goto('/inventory');
  
  // Create RM-A
  await page.click('button:has-text("Create Item")');
  await page.fill('input[placeholder="Auto-generated"]', rmA);
  await page.fill('input[placeholder="Item Name"]', 'Raw Material A');
  await page.selectOption('select', { label: 'kg' }); // Assuming kg exists
  await page.click('button:has-text("Save Item")');

  // Create RM-B
  await page.click('button:has-text("Create Item")');
  await page.fill('input[placeholder="Auto-generated"]', rmB);
  await page.fill('input[placeholder="Item Name"]', 'Raw Material B');
  await page.selectOption('select', { label: 'kg' });
  await page.click('button:has-text("Save Item")');

  // Create FG-X
  await page.click('button:has-text("Create Item")');
  await page.fill('input[placeholder="Auto-generated"]', fgX);
  await page.fill('input[placeholder="Item Name"]', 'Finished Good X');
  await page.selectOption('select', { label: 'pcs' });
  await page.click('button:has-text("Save Item")');

  // 4. ENGINEERING (BOM)
  await page.goto('/bom');
  await page.click('button:has-text("Create BOM")');
  // Select FG-X
  await page.click('text=Select Item...'); 
  await page.fill('input[placeholder="Search..."]', fgX);
  await page.click(`text=${fgX}`);
  
  // Add RM-A (50%)
  await page.click('text=Select Material...');
  await page.fill('input[placeholder="Search..."]', rmA);
  await page.click(`text=${rmA}`);
  await page.fill('input[type="number"]', '0.5');
  await page.click('button:has-text("Add Line")');

  // Add RM-B (50%)
  await page.click('text=Select Material...'); // Re-open dropdown
  await page.fill('input[placeholder="Search..."]', rmB);
  await page.click(`text=${rmB}`);
  await page.fill('input[type="number"]', '0.5');
  await page.click('button:has-text("Add Line")');

  await page.click('button:has-text("Save Recipe")');

  // 5. PROCUREMENT (Purchase Order)
  await page.goto('/purchase-orders');
  await page.click('button:has-text("Create")');
  await page.fill('input[placeholder="Auto-generated"]', poNum);
  
  // Select Supplier
  await page.click('text=Select Supplier...');
  await page.fill('input[placeholder="Search..."]', supplierName);
  await page.click(`text=${supplierName}`);

  // Select Warehouse (First one)
  await page.locator('select').nth(0).selectOption({ index: 1 });

  // Add Line: RM-A
  await page.click('text=Select Item...');
  await page.fill('input[placeholder="Search..."]', rmA);
  await page.click(`text=${rmA}`);
  await page.fill('input[placeholder="0"]', '100');
  await page.click('button:has-text("Add")');

  // Add Line: RM-B
  await page.click('text=Select Item...');
  await page.fill('input[placeholder="Search..."]', rmB);
  await page.click(`text=${rmB}`);
  await page.fill('input[placeholder="0"]', '100');
  await page.click('button:has-text("Add")');

  await page.click('button:has-text("Save PO")');

  // Receive PO
  await page.click('button:has-text("Receive")');
  await expect(page.locator('text=RECEIVED')).toBeVisible();

  // 6. SALES (Sales Order)
  await page.goto('/sales-orders');
  await page.click('button:has-text("Create")');
  await page.fill('input[placeholder="Auto-generated"]', soNum);

  // Select Customer
  await page.click('text=Select Customer...');
  await page.fill('input[placeholder="Search..."]', customerName);
  await page.click(`text=${customerName}`);

  // Add Line: FG-X (Qty 10)
  await page.click('text=Select Item...');
  await page.fill('input[placeholder="Search..."]', fgX);
  await page.click(`text=${fgX}`);
  await page.fill('input[placeholder="0"]', '10');
  await page.click('button:has-text("Add")');

  await page.click('button:has-text("Save Order")');

  // 7. PRODUCTION (The Bridge)
  // Click "PRODUCE" on the Sales Order line
  await page.click('button:has-text("PRODUCE")');

  // We should be on Manufacturing page with modal open
  await expect(page).toHaveURL(/\/manufacturing/);
  await expect(page.locator('text=NEW PRODUCTION RUN')).toBeVisible();
  
  // Check if Qty 10 is pre-filled
  const qtyInput = page.locator('input[value="10"]');
  await expect(qtyInput).toBeVisible();

  // Select Target Location (First one)
  await page.locator('select').nth(0).selectOption({ index: 1 });

  await page.click('button:has-text("CREATE WORK ORDER")');

  // 8. EXECUTION
  // Find the WO (it should be at the top)
  await page.click('button:has-text("START")');
  await expect(page.locator('text=IN_PROGRESS')).toBeVisible();

  await page.click('button:has-text("FINISH")');
  await expect(page.locator('text=COMPLETED')).toBeVisible();

  // Success!
});
