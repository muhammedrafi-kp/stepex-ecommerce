import Coupons from "../models/couponModel.js";


const loadCoupons = async (req, res, next) => {
    try {
        const couponData = await Coupons.find({});
        res.render("coupons", { coupons: couponData });
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const loadAddCoupon = async (req, res, next) => {
    try {
        res.render("add-coupon");
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const addCoupon = async (req, res, next) => {
    try {
        console.log("hello");
        const { couponCode, minPrice, discount, validity } = req.body;
        const existingCoupon = await Coupons.findOne({ coupon_code: couponCode });

        if (existingCoupon) {
            console.log("yes", existingCoupon);
            return res.status(409).json({ success: false, message: 'coupon with this code already exists' });
        } else {
            console.log("no");

            const coupon = new Coupons({
                coupon_code: couponCode,
                min_price: minPrice,
                discount: discount,
                validity: validity
            });
            await coupon.save();
            return res.status(201).json({ success: true, message: 'coupon added successfully' });
        }

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const loadEditCoupon = async (req, res, next) => {
    try {
        const couponId = req.query.id;
        const couponData = await Coupons.findOne({ _id: couponId });

        res.render("edit-coupon", { coupon: couponData });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const editCoupon = async (req, res, next) => {
    try {
        console.log("editCoupon");
        const { couponId, couponCode, minPrice, discount, validity } = req.body;
        const existingCoupon = await Coupons.findOne({ coupon_code: couponCode, _id: { $ne: couponId } });
        if (existingCoupon) {
            return res.status(409).json({ success: false, message: 'coupon with this code already exists' });
        } else {
            await Coupons.findOneAndUpdate(
                { _id: couponId },
                { $set: { coupon_code: couponCode, min_price: minPrice, discount: discount, validity: validity } },
                { new: true }
            );
            return res.status(200).json({ success: true, message: 'coupon updated successfully' });
        }
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const activateCoupon = async (req, res, next) => {
    try {
        console.log("activateCoupon");
        const couponId = req.query.id;
        const coupon = await Coupons.findOne({ _id: couponId });
        console.log(coupon);
        await Coupons.findOneAndUpdate(
            { _id: couponId },
            { $set: { is_active: true } },
            { new: true }
        );
        res.status(200).json({ message: 'activated successfully' });
        console.log('activated successfully');
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const deactivateCoupon = async (req, res, next) => {
    try {
        console.log("deactivateCoupon");
        const couponId = req.query.id;
        const coupon = await Coupons.findOne({ _id: couponId });
        console.log(coupon);
        await Coupons.findOneAndUpdate(
            { _id: couponId },
            { $set: { is_active: false } },
            { new: true }
        );
        res.status(200).json({ message: 'deactivated successfully' });
        console.log('deactivated successfully');
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const deleteCoupon = async (req, res, next) => {
    try {
        console.log("deleteCoupon");
        const couponId = req.query.id;
        await Coupons.deleteOne({ _id: couponId });
        res.status(200).json({ message: 'coupon deleted successfully' });
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}


export {
    loadCoupons,
    loadAddCoupon,
    addCoupon,
    loadEditCoupon,
    editCoupon,
    deleteCoupon,
    activateCoupon,
    deactivateCoupon
}