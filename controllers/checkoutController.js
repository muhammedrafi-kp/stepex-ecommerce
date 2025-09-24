import mongoose from "mongoose";
import User from "../models/userModel.js";
import Cart from "../models/cartModel.js";
import Address from "../models/addressModel.js";
import Product from "../models/productsModel.js";
import Order from "../models/orderModel.js";
import Wallet from "../models/walletModel.js";
import Coupon from "../models/couponModel.js";
import Razorpay from "razorpay";
import { TRANSACTION_TYPES, REFERRAL_REWARD } from "../constants/wallet.js"

const { RAZORPAY_ID_KEY, RAZORPAY_SECRET_KEY } = process.env;

const razorpay = new Razorpay({
    key_id: RAZORPAY_ID_KEY,
    key_secret: RAZORPAY_SECRET_KEY
});

const proceedToCheckout = async (req, res, next) => {
    try {
        const userId = req.session._id;
        const cartData = await Cart.findOne({ user_id: userId }).populate('items.products');

        let outOfStockProducts = [];
        let maxStockExceed = [];
        if (cartData) {
            for (const item of cartData.items) {
                console.log(item.quantity)
                const product = item.products;
                if (product.quantity <= 0) {
                    outOfStockProducts.push(product.name);
                } else if (product.quantity < item.quantity) {
                    maxStockExceed.push(product.name);
                }
            }
        }

        if (outOfStockProducts.length > 0) {
            res.status(400).json({ message: 'Few items are unavailable for checkout.Please remove them before proceeding to checkout.' });
        } else if (maxStockExceed.length > 0) {
            res.status(400).json({ message: 'Few items are exceed maximum quantity.Please reduce the quantity before proceeding to checkout.' });
        } else {
            delete req.session.discount;
            res.status(200).json();
        }

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const loadCheckout = async (req, res, next) => {
    try {
        console.log("key_id:", razorpay.key_id);
        const userId = req.session._id;
        const userData = await User.findOne({ _id: userId });

        const address = await Address.findOne({ user_id: userId });
        const cartData = await Cart.findOne({ user_id: userId }).populate('items.products');
        const cartItemCount = cartData ? cartData.items.length : 0;

        let totalAmount = 0;
        if (cartData?.items.length > 0) {
            for (const item of cartData.items) {
                totalAmount += item.products.offer_price * item.quantity;
            }
        }

        const validCoupons = await Coupon.find({
            min_price: { $lte: totalAmount },
            validity: { $gte: new Date() },
            is_active: true
        });

        // pagination for addresses
        const limit = 4;
        const requestedPage = parseInt(req.query.page) || 1;
        const totalCount = address && Array.isArray(address.address) ? address.address.length : 0;
        const totalPages = Math.max(1, Math.ceil(totalCount / limit));
        const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
        const skip = (currentPage - 1) * limit;
        const addressList = address && Array.isArray(address.address)
            ? address.address.slice(skip, skip + limit)
            : [];

        if (cartData.items.length > 0) {
            res.render("checkout-details", {
                user: userData,
                addressList: addressList,
                totalCount: totalCount,
                currentPage: currentPage,
                totalPages: totalPages,
                limit: limit,
                cart: cartData,
                coupons: validCoupons,
                totalAmount,
                cartCount: cartItemCount,
                req
            });

        } else {
            res.redirect("/shop");
        }

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const applyCoupon = async (req, res, next) => {
    try {
        console.log("apply coupon");
        const { couponCode } = req.body;
        const coupon = await Coupon.findOne({ coupon_code: couponCode });
        req.session.discount = coupon.discount;
        console.log("discount:", req.session.discount);

        res.status(200).json({ success: true });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const removeCoupon = async (req, res, next) => {
    try {
        delete req.session.discount;
        res.status(200).json({ success: true });
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const selectAddressForCheckout = async (req, res, next) => {
    try {
        req.session.addressIndex = req.body.addressIndex;
        const userId = req.session._id;
        const cartData = await Cart.findOne({ user_id: userId }).populate('items.products');

        let outOfStockProducts = [];
        let maxStockExceed = [];

        if (cartData || cartData.items) {
            for (const item of cartData.items) {
                console.log(item.quantity)
                const product = item.products;
                if (product.quantity <= 0) {
                    outOfStockProducts.push(product.name);
                } else if (product.quantity < item.quantity) {
                    maxStockExceed.push(product.name);
                }
            }
        }

        if (outOfStockProducts.length > 0) {
            res.status(400).json({ message: 'Few items are unavailable for checkout.Please remove them before continue.' });
        } else if (maxStockExceed.length > 0) {
            res.status(400).json({ message: 'Few items are exceed maximum quantity.Please reduce the quantity before continue.' });
        } else {
            res.status(200).json({ success: true });
        }

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


const loadPayment = async (req, res, next) => {
    try {

        if (!req.session.addressIndex) {
            res.redirect("/cart");
        };

        const userId = req.session._id;
        const userData = await User.findOne({ _id: userId });

        const addressData = await Address.findOne({ user_id: userId });
        const cartData = await Cart.findOne({ user_id: userId }).populate('items.products');
        const cartItemCount = cartData ? cartData.items.length : 0;
        const walletData = await Wallet.findOne({ user_id: userId });
        let totalAmount = 0;

        if (cartData.items.length > 0) {
            for (const item of cartData.items) {
                totalAmount += item.products.offer_price * item.quantity;
            }

            res.render("checkout-payment", {
                user: userData,
                address: addressData.address[req.session.addressIndex],
                totalAmount: totalAmount, wallet: walletData, cartCount: cartItemCount,
                razorpaykey: RAZORPAY_ID_KEY,
                req
            });

        } else {
            res.redirect("/shop");
        }

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}



const confirmOrder = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {

        const userId = req.session._id;
        const { paymentMethod, paymentStatus } = req.body;

        if (paymentMethod === "Wallet"||paymentMethod === "COD") {

            if (!handlePaymentLock(req)) {
                return res.status(400).json({
                    success: false,
                    message: "Payment already in progress. Please wait for the previous payment to complete."
                });
            }
        }

        const { valid, outOfStock, maxExceed, cartData } = await validateCart(userId, session);

        if (!valid) {
            let message = "";

            if(!cartData||cartData.items.length === 0){
                return res.status(409).json({
                    success: false,
                    message: "Your cart is empty!"
                });
            }

            if (outOfStock.length > 0) {
                message += `The following items are out of stock: ${outOfStock.join(", ")}. `;
            }

            if (maxExceed.length > 0) {
                message += `The following items exceed available stock: ${maxExceed.join(", ")}.`;
            }

            return res.status(400).json({
                success: false,
                message: message.trim(),
                outOfStock,
                maxExceed
            });
        }

        const { items, totalAmount, discount } = await calculateCartTotals(
            cartData,
            req.session.discount,
            paymentMethod,
            paymentStatus,
            session
        );

        await createOrder(userId, items, totalAmount, discount, req.session.addressIndex, paymentMethod, paymentStatus, session);

        let walletBalance;
        //Wallet debit if Wallet payment
        if (paymentMethod === "Wallet") {
            walletBalance = await updateWallet(userId, -totalAmount, "debit", session);
        }

        console.log("updated wallet balance:", walletBalance)

        //Referral bonus (only for first order)
        const existingOrders = await Order.findOne({ user: userId }).session(session);
        if (!existingOrders) {
            await applyReferralBonus(userId, session);
        }

        // Commit transaction
        await session.commitTransaction();

        delete req.session.discount;
        delete req.session.paymentLock;

        res.status(200).json({ success: true });
    } catch (error) {
        await session.abortTransaction();
        error.statusCode = 500;
        next(error);
    } finally {
        session.endSession();
    }
}

const createRazorPay = async (req, res, next) => {
    try {
        const userId = req.session._id;

        // Prevent simultaneous payments
        if (!handlePaymentLock(req)) {
            return res.status(400).json({
                success: false,
                message: "Payment already in progress. Please wait for the previous payment to complete."
            });
        }

        //Fetch user cart
        const cartData = await Cart.findOne({ user_id: userId }).populate("items.products");
        if (!cartData || cartData.items.length === 0) {
            return res.status(409).json({ message: "Your cart is empty!" });
        }

        const { outOfStock, maxExceed } = validateStock(cartData);
        if (outOfStock.length > 0) {
            return res.status(400).json({ message: `Out of stock: ${outOfStock.join(", ")}` });
        }
        if (maxExceed.length > 0) {
            return res.status(400).json({ message: `Exceeds stock: ${maxExceed.join(", ")}` });
        }

        // Calculate total
        let totalAmount = calculateTotal(cartData, req.session.discount);

        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: totalAmount * 100, // paise
            currency: "INR",
            receipt: generateReceiptID(),
            payment_capture: 1
        });

        // Save payment lock to session
        req.session.paymentLock = {
            orderId: razorpayOrder.id,
            expireAt: new Date(Date.now() + 1 * 60 * 1000)
        };

        req.session.save(err => {
            if (err) console.error("Session save error:", err);
            res.status(200).json({ success: true, order: razorpayOrder });
        });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
};

const paymentUnlock = async (req, res, next) => {
    try {
        delete req.session.paymentLock;
        res.status(200).json({ success: true });
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const loadOrderPlaced = async (req, res, next) => {
    try {
        const { status } = req.query;
        const userId = req.session._id;
        const userData = await User.findOne({ _id: userId });
        const cartData = await Cart.findOne({ user_id: userId }).populate('items.products');
        const cartItemCount = cartData ? cartData.items.length : 0;

        res.render("order-placed", { user: userData, cartCount: cartItemCount, status });
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


/* ----------- Helpers ---------- */


// For create razopay order
function handlePaymentLock(req) {
    const lock = req.session.paymentLock;
    if (!lock) return true;

    const now = new Date();
    const expireAt = new Date(lock.expireAt);

    if (now < expireAt) {
        return false;
    }

    delete req.session.paymentLock;
    return true;
}

function validateStock(cartData) {
    const outOfStock = [];
    const maxExceed = [];

    for (const item of cartData.items) {
        const product = item.products;
        if (!product) continue;

        if (product.quantity <= 0) {
            outOfStock.push(product.name);
        } else if (product.quantity < item.quantity) {
            maxExceed.push(product.name);
        }
    }

    return { outOfStock, maxExceed };
}

function calculateTotal(cartData, discount = 0) {
    let total = 0;
    for (const item of cartData.items) {
        total += item.products.price * item.quantity;
    }

    if (discount) {
        total -= total * (discount / 100);
    }

    return Math.round(total);
}

function generateReceiptID() {
    return "rcpt_" + Date.now();
}


// For confirm order
const validateCart = async (userId, session) => {
    const cartData = await Cart.findOne({ user_id: userId })
        .populate("items.products")
        .session(session);

    if (!cartData || cartData.items.length === 0) {
        return { valid: false, outOfStock: [], maxExceed: [], cartData: null };
    }

    let outOfStock = [];
    let maxExceed = [];

    for (const item of cartData.items) {
        const product = item.products;
        if (!product) continue;

        if (product.quantity <= 0) {
            outOfStock.push(product.name);
        } else if (product.quantity < item.quantity) {
            maxExceed.push(product.name);
        }
    }

    return {
        valid: outOfStock.length === 0 && maxExceed.length === 0,
        outOfStock,
        maxExceed,
        cartData
    };
};

const calculateCartTotals = async (cartData, discountPercent = 0, paymentMethod, paymentStatus, session) => {
    let totalAmount = 0;
    let items = [];

    for (const item of cartData.items) {
        const product = await Product.findById(item.products).session(session);

        const status = (paymentMethod === "Razorpay" && paymentStatus === "Pending")
            ? "Pending"
            : "Confirmed";

        const itemDetails = {
            product_id: product._id,
            name: product.name,
            price: product.offer_price,
            category: product.category,
            gender: product.gender,
            brand: product.brand,
            imageUrl: product.images[0],
            quantity: item.quantity,
            status
        };

        items.push(itemDetails);

        totalAmount += product.offer_price * item.quantity;

        // reduce stock
        product.quantity -= item.quantity;
        await product.save({ session });
    }

    const discountAmount = discountPercent ? Math.round(totalAmount * (discountPercent / 100)) : 0;
    const finalAmount = Math.round(totalAmount - discountAmount);

    return { items, totalAmount: finalAmount, discount: discountAmount };
};

const createOrder = async (userId, items, totalAmount, discount, addressIndex, paymentMethod, paymentStatus, session) => {
    const addressData = await Address.findOne({ user_id: userId }).session(session);

    const newOrder = new Order({
        user: userId,
        orderId: generateOrderID(),
        totalAmount,
        discount,
        items,
        address: addressData.address[addressIndex],
        payment_method: paymentMethod,
        payment_status: paymentStatus
    });

    await newOrder.save({ session });

    // empty cart
    await Cart.findOneAndUpdate({ user_id: userId }, { items: [] }).session(session);
};

const updateWallet = async (userId, amount, type, session) => {
    let wallet = await Wallet.findOne({ user_id: userId }).session(session);

    if (!wallet) {
        wallet = new Wallet({
            user_id: userId,
            balance: 0,
            history: []
        });
    }

    const previousBalance = wallet.balance || 0;
    const updatedBalance = previousBalance + amount;
    wallet.balance = updatedBalance;

    const transaction = {
        amount: Math.abs(amount),
        transaction_type: type,
        previous_balance: previousBalance,
        new_balance: updatedBalance,
        created_at: new Date()
    };

    wallet.history.push(transaction);
    await wallet.save({ session });
    return transaction.new_balance;
};

const applyReferralBonus = async (userId, session) => {
    const userData = await User.findById(userId).session(session);
    if (!userData?.referred_code) return;

    const referrer = await User.findOne({ referral_code: userData.referred_code }).session(session);
    if (!referrer) return;

    // referrer gets 100
    await updateWallet(referrer._id, 100, "Referral cashback", session);
    // referred user gets 25
    await updateWallet(userId, 25, "Referral cashback", session);
};

const generateOrderID = () => {
    const min = 10000000;
    const max = 99999999;
    return Math.floor(Math.random() * (max - min + 1) + min);
}



export {
    loadCheckout,
    proceedToCheckout,
    applyCoupon,
    removeCoupon,
    selectAddressForCheckout,
    loadPayment,
    confirmOrder,
    loadOrderPlaced,
    createRazorPay,
    paymentUnlock
}