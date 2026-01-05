document.addEventListener('DOMContentLoaded', function () {

    // Function to attach listeners to dynamic content
    function attachListeners() {
        const table = document.getElementById('odds-table');
        if (!table) return;

        // 1. Intercept Checkbox Links
        const links = table.querySelectorAll('.cb-link');
        links.forEach(link => {
            link.removeEventListener('click', handleLinkClick); // prevent duplicates
            link.addEventListener('click', handleLinkClick);
        });

        // 2. Intercept Sort/Filter Links (Optional but consistent)
        // Let's stick to Checkboxes first as requested, but user might want all.
        // User asked "select options", so focusing on checkboxes.
    }

    async function handleLinkClick(e) {
        e.preventDefault();
        const link = e.currentTarget;
        const url = link.href;

        // Show Loading State (e.g. opacity)
        const tableBody = document.getElementById('table-body');
        if (tableBody) tableBody.style.opacity = '0.5';

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');

            const htmlText = await response.text();

            // Parse HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');

            // Extract new Table Body
            const newTableBody = doc.getElementById('table-body');
            const currentTableBody = document.getElementById('table-body');

            if (newTableBody && currentTableBody) {
                currentTableBody.replaceWith(newTableBody);
                // Re-attach listeners to new content
                attachListeners();
            }

        } catch (error) {
            console.error('Fetch error:', error);
            // Fallback: Full reload
            window.location.href = url;
        }
    }

    // Initial Attach
    attachListeners();
});
