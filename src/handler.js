const axios = require('axios');
const robotsParser = require('robots-parser');

exports.handler = async (event) => {
    const urls = event.urls;
    const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL; // Make sure to set this in your Lambda environment variables

    async function sendToSlack(disallowedUrls) {
        const message = {
            text: `The following URLs are Disallowed by robots.txt:\n${disallowedUrls.join('\n')}`,
        };

        try {
            await axios.post(SLACK_WEBHOOK_URL, message);
        } catch (error) {
            console.error('Error sending message to Slack:', error.message);
        }
    }

    // Function to get and parse robots.txt file
    async function getRobotsTxt(url) {
        try {
            const robotsUrl = new URL('/robots.txt', url).href;
            const response = await axios.get(robotsUrl);
            return robotsParser(robotsUrl, response.data);
        } catch (error) {
            console.error(`Error fetching robots.txt for ${url}:`, error.message);
            // In case the robots.txt is not found or other errors occur, we return null
            return null;
        }
    }

    // Function to check if a URL is allowed by the robots.txt rules
    async function isUrlAllowed(url) {
        const robotsTxt = await getRobotsTxt(url);
        if (!robotsTxt) {
            return 'Error: Could not retrieve robots.txt or not found';
        }

        // Assuming 'Googlebot' as the user agent; change as needed.
        return robotsTxt.isAllowed(url, 'Googlebot');
    }

    async function checkUrl(url) {
        const allowed = await isUrlAllowed(url);
        return {
            url: url,
            allowed: allowed,
        };
    }

    try {
        // Execute all requests in parallel
        const checkPromises = urls.map(checkUrl);
        const checkResults = await Promise.all(checkPromises);

        // Filter out the disallowed URLs
        const disallowedUrls = checkResults
            .filter(result => !result.allowed)
            .map(result => result.url);

        // If there are any disallowed URLs, send them to Slack
        if (disallowedUrls.length > 0) {
            await sendToSlack(disallowedUrls);
        }

        // Prepare the response
        const results = checkResults.reduce((acc, current) => {
            acc[current.url] = current.allowed ? 'Allowed' : 'Disallowed';
            return acc;
        }, {});

        return {
            statusCode: 200,
            body: JSON.stringify(results),
        };
    } catch (error) {
        console.error('An error occurred:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};