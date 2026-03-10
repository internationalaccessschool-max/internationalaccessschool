import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log(`PAGE ERROR JS: ${msg.text()}`);
            if (msg.args()) {
                Promise.all(msg.args().map(a => a.jsonValue().catch(() => 'no-json'))).then(args => {
                    console.log('ARGS:', JSON.stringify(args, null, 2));
                });
            }
        }
    });

    page.on('pageerror', error => {
        console.log(`UNCAUGHT EXCEPTION: ${error.message}`);
        console.log(error.stack);
    });

    console.log("Navigating to login...");
    await page.goto('http://localhost:3000/login');

    console.log("Clicking Student Role...");
    // Find the text "Student" or any element that navigates to the student login
    await page.click('text="Student"');

    console.log("Filling form...");
    await page.waitForSelector('input[name="admissionNo"]', { timeout: 10000 });
    await page.fill('input[name="admissionNo"]', '123456');
    await page.fill('input[name="dob"]', '2000-01-01');

    console.log("Submitting...");
    await page.click('button[type="submit"]');

    console.log("Waiting for error...");
    await page.waitForTimeout(4000);

    console.log("Done.");
    await browser.close();
})();
