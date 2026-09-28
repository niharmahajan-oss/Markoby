import 'dotenv/config';
import Razorpay from 'razorpay';
console.log("ESM default:", Razorpay);
const cjs = require('razorpay');
console.log("CJS require:", cjs);
