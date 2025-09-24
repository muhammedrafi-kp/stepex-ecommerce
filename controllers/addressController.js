import User from "../models/userModel.js";
import Address from "../models/addressModel.js";
import Cart from "../models/cartModel.js";


const loadAddress = async (req, res, next) => {
    try {
        const userId = req.session._id;
        const userData = await User.findOne({ _id: userId });
        const address = await Address.findOne({ user_id: userData });
        const cart = await Cart.findOne({ user_id: userId }).populate('items.products');
        const cartItemCount = cart ? cart.items.length : 0;

        // pagination
        const limit = 4;
        const requestedPage = parseInt(req.query.page) || 1;
        const totalCount = address && Array.isArray(address.address) ? address.address.length : 0;
        const totalPages = Math.max(1, Math.ceil(totalCount / limit));
        const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
        const skip = (currentPage - 1) * limit;
        const addressList = address && Array.isArray(address.address)
            ? address.address.slice(skip, skip + limit)
            : [];

        res.render("address", {
            user: userData,
            addressList: addressList,
            cartCount: cartItemCount,
            currentPage: currentPage,
            totalPages: totalPages,
            limit: limit,
            totalCount: totalCount
        });
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const addAddress = async (req, res, next) => {
    try {
        console.log("add address hi")
        console.log(req.body)
        const { name, street_address, place, city, state, mno, pincode } = req.body;
        const userId = req.session._id;
        const address = await Address.findOne({ user_id: userId });
        if (address) {

            await Address.findOneAndUpdate({ user_id: userId }, {
                $push: {
                    address: {
                        name: name,
                        street_address: street_address,
                        place: place,
                        city: city,
                        state: state,
                        mobile: mno,
                        pincode: pincode
                    }
                }
            });
            res.status(200).json({ success: true, message: "New address added successfully" });

        } else {
            const newAddress = new Address({
                user_id: userId,
                address: [{
                    name: name,
                    street_address: street_address,
                    place: place,
                    city: city,
                    state: state,
                    mobile: mno,
                    pincode: pincode
                }]
            });
            await newAddress.save();
            res.status(200).json({ success: true, message: "New address added successfully" });
        }

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
}

const removeAddress = async (req, res, next) => {
    try {
        const index = req.query.index;
        console.log("index:", index);
        const userId = req.session._id;
        const address = await Address.findOne({ user_id: userId });

        if (!address) {
            return res.status(404).json({ message: "User not found" });
        }

        address.address.splice(index, 1);
        await address.save();
        res.status(200).json({ message: "Address removed successfully" });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
};

const editAddress = async (req, res, next) => {
    try {
        const userId = req.session._id;
        const { index, name, street_address, place, city, state, mno, pincode } = req.body;
        const address = await Address.findOne({ user_id: userId });
        if (!address) {
            return res.status(404).json({ success: false, message: "Address not found" });
        }
        await Address.updateOne(
            { user_id: userId },
            {
                $set: {
                    [`address.${index}.name`]: name,
                    [`address.${index}.street_address`]: street_address,
                    [`address.${index}.place`]: place,
                    [`address.${index}.city`]: city,
                    [`address.${index}.state`]: state,
                    [`address.${index}.mobile`]: mno,
                    [`address.${index}.pincode`]: pincode
                }
            }
        );

        console.log(address);
        res.status(200).json({ success: true, message: "Address updated successfully" });

    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
};

export {
    loadAddress,
    addAddress,
    removeAddress,
    editAddress
}