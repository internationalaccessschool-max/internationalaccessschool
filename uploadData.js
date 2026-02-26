const fs = require('fs');

async function uploadCSV() {
    const csvData = fs.readFileSync('test-students-bulk-upload.csv', 'utf8');
    const lines = csvData.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length < 2) {
        console.log('No data found in CSV.');
        return;
    }

    const headers = lines[0].split(',');

    const studentsData = [];

    for (let i = 1; i < lines.length; i++) {
        const rowData = lines[i].split(',');
        const student = {};
        for (let j = 0; j < headers.length; j++) {
            student[headers[j]] = rowData[j] || "";
        }
        studentsData.push(student);
    }

    console.log(`Parsed ${studentsData.length} students from CSV. Proceeding to upload...`);

    try {
        const response = await fetch("http://localhost:3000/api/admin/bulk-register-students", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ students: studentsData })
        });

        const result = await response.json();
        if (response.ok) {
            console.log("Bulk upload successful!");
            console.log(`Success count: ${result.successCount}`);
            if (result.errors && result.errors.length > 0) {
                console.warn(`Encountered ${result.errors.length} errors:`);
                result.errors.forEach(e => console.warn(`- Row ${e.row}: ${e.error}`));
            }
        } else {
            console.error("Bulk upload failed!");
            console.error(result.error);
        }
    } catch (error) {
        console.error("Fetch request failed:", error.message);
    }
}

uploadCSV();
