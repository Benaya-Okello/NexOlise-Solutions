const express = require('express');
const axios = require('axios');
const router = express.Router();

// M-Pesa API Credentials
const shortcode = 'YOUR_SHORTCODE';
const lipaNaMpesaOnline = 'YOUR_LIPA_NA_MPESA_ONLINE';
const securityCredential = 'YOUR_SECURITY_CREDENTIAL';
const passkey = 'YOUR_PASSKEY';
const initiatorName = 'YOUR_INITIATOR_NAME';
const initiatorPassword = 'YOUR_INITIATOR_PASSWORD';
const callbackUrl = 'YOUR_CALLBACK_URL'; // URL for payment callbacks

// Function to generate a base64 token
const getToken = async () => {
    const apiUrl = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
    const auth = Buffer.from(`${lipaNaMpesaOnline}:${passkey}`).toString('base64');

    const response = await axios.get(apiUrl, {
        headers: {
            Authorization: `Basic ${auth}`
        }
    });
    
    return response.data.access_token;
};

// STK Push Endpoint
router.post('/stk/push', async (req, res) => {
    const token = await getToken();
    const phoneNumber = req.body.phone; // Customer phone number
    const amount = req.body.amount; // Amount to be charged

    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    const payload = {
        "BusinessShortCode": shortcode,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": amount,
        "PartyA": phoneNumber,
        "PartyB": shortcode,
        "PhoneNumber": phoneNumber,
        "CallBackURL": callbackUrl,
        "AccountReference": "Test123",
        "TransactionDesc": "Payment for testing"
    };

    try {
        const response = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', payload, { headers });
        res.json(response.data);
    } catch (error) {
        res.status(error.response.status).json(error.response.data);
    }
});

// Callback Handler
router.post('/callback', (req, res) => {
    console.log(req.body); // Log the callback details
    // Process the callback and update the payment status as required
    res.sendStatus(200);
});

// Payment Verification Endpoint
router.post('/verification', async (req, res) => {
    const token = await getToken();
    
    // Example payment processing logic
    const paymentDetails = req.body; // The payment details from the callback

    // Here you can validate the payment details with M-Pesa
    // ...

    res.sendStatus(200);
});

module.exports = router;
