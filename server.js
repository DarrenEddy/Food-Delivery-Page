const express = require("express");
const app = express();
app.use(express.static("./public"));
const session = require("express-session")
const multer = require("multer")

const HTTP_PORT = process.env.PORT || 8080;
const path = require("path");

app.use(session({
    secret: 'terrace cat', // any random string used for configuring the session
    resave: false,
    saveUninitialized: true
}))

const myStorage = multer.diskStorage({
    destination: "./public/photo",
    filename: function (req, file, cb) {
        cb(null, req.params.confirmationId + path.extname(file.originalname))
    }
})

app.use(express.static("./public/"))

// associate the storage config to multer middleware
const upload = multer({ storage: myStorage })

app.use(express.urlencoded({ extended: true }))

const exphbs = require("express-handlebars");
app.engine(".hbs", exphbs.engine({ extname: ".hbs" }));
app.set("view engine", ".hbs");

const mongoose = require('mongoose');

const CONNECTION_STRING = "mongodb+srv://dbUser:ZwtWLObPOyNN2pi1@cluster0.ab9me3p.mongodb.net/MADS4012Project?retryWrites=true&w=majority&appName=AtlasApp";

mongoose.connect(CONNECTION_STRING)

const db = mongoose.connection
db.on("error", console.error.bind(console, "Error connecting to database: "));
db.once("open", () => {
    console.log("Mongo DB connected successfully.");
});

const Schema = mongoose.Schema

const MenuSchema = new Schema({
    name: String, description: String,
    price: Number, image: String
})
const menuCollection = mongoose.model("menu-item", MenuSchema)

const OrderSchema = new Schema({
    customerName: String, address: String,
    items: [String], dateAndTime: String, status: String,
    driverName: String, confirmation: Number
})
const orderCollection = mongoose.model("order-item", OrderSchema)

const DriverSchema = new Schema({
    username: String, password: String,
    fullName: String, vModel: String, vColour: String, license: String
})
const driverCollection = mongoose.model("driver-item", DriverSchema)


// ========================Globals=================================
const currentOrder = []
const DELIVER_CHARGE = 2

// ===================== /menu ====================================
app.get("/", async (req, res) => {
    try {
        const results = await menuCollection.find().lean().exec();

        for (item of results) {
            if (currentOrder.indexOf(item.name) >= 0) {
                item.contained = true
            }
            else {
                item.contained = false
            }
        }
        //console.log(JSON.stringify(results))

        res.render("menu", { layout: false, menu: results })
    } catch (err) {
        console.log(err);
        return res.send(err)
    }
})

//===================== Your Order ================================
app.get("/yourOrder", async (req, res) => {
    let receipt = []
    let total = 0
    try {
        const orderMenuItems = []
        for (nameOfItem of currentOrder) {
            const results = await menuCollection.findOne({ name: nameOfItem }).lean().exec()
            orderMenuItems.push(results)
            receipt.push(results)
        }
        //REMOVE
        let errParam = false
        let passParam = ""
        if (req.session.submitError === "error") {
            errParam = true
            req.session.submitError = ""
        }

        else if (req.session.submitError > 1) {
            passParam = req.session.submitError
            orderMenuItems.splice(0, orderMenuItems.length)
            currentOrder.splice(0, currentOrder.length)
            req.session.submitError = ""
            
            receipt.push({ name: "Delivery Charge", price: DELIVER_CHARGE })
            for (item of receipt) {
                total += item.price
            }
           


        }

        return res.render("yourOrder", { layout: false, order: orderMenuItems, error: errParam, orderId: passParam, rec: receipt, orderTotal:total.toFixed(2) })
    }
    catch (err) {
        console.log(err);
        return res.send(err)
    }
})

app.post("/submitOrder", async (req, res) => {
    const name = req.body.name
    const address = req.body.address
    if (name === "" || name === undefined || address === "" || address === undefined) {
        req.session.submitError = "error"
        return res.redirect("/yourOrder")
    }
    else {
        try {
            //generate code to send back to user
            const orderId = Math.floor(Math.random() * 90000) + 10000
            req.session.submitError = orderId
            addInfo =
            {
                customerName: name,
                address: address,
                items: currentOrder,
                dateAndTime: Date(),
                status: "RECEIVED",
                driverName: "",
                confirmation: orderId
            }

            const order = new orderCollection(addInfo)
            await order.save()


            return res.redirect("/yourOrder")
        }
        catch (err) {
            console.log(err);
            return res.send(err)
        }
    }
})

app.get("/addToCart/:menuItemName", (req, res) => {
    const item = req.params.menuItemName
    //for checking if its already in the list ==REMOVE IF IMPLEMENTING QUANTITIY
    if (currentOrder.indexOf(item) < 0) {
        currentOrder.push(item)
    }
    //console.log(currentOrder)
    res.redirect("/")
})

app.get("/removeFromCart/:menuItemName/:redir", (req, res) => {
    const item = req.params.menuItemName

    currentOrder.splice(currentOrder.indexOf(item), 1)

    //redir handles where to redirect as this get method is used by both menu and Your Orders
    const redir = (req.params.redir == "menu") ? "" : req.params.redir
    res.redirect("/" + redir)
})


app.get("/emptyCart", (req, res) => {
    currentOrder.splice(0, currentOrder.length)
    res.redirect("/yourOrder")
})

// =================== Order Status =================================
app.get("/orderStatus", async (req, res) => {
    let errorMsg = ""
    if (req.session.submitError !== "") // might have undefined isseue?
    {
        errorMsg = req.session.submitError
        req.session.submitError = ""
    }
    res.render("orderStatus", { layout: false, error: errorMsg })
})

app.post("/searchOrderStatus", async (req, res) => {
    const orderId = req.body.orderId
    const fs = require('fs')

    try {

        if (orderId === "" || orderId === undefined) {
            req.session.submitError = "Need To Enter This Field"
            return res.redirect("/orderStatus")
        }
        const result = await orderCollection.findOne({ confirmation: ~~orderId }).lean().exec()
        if (result === null) {
            req.session.submitError = "No Order Found"
            return res.redirect("/orderStatus")
        }

        let driver = ""
        if (result.driverName !== "") {
            driver = await driverCollection.findOne({ username: result.driverName }).lean().exec()
        }

        result.hasImage = fs.existsSync(`public/photo/${result.confirmation}.jpg`)
        //console.log(driver)

        return res.render("orderStatus", { layout: false, error: "", order: result, driver: driver })


    }
    catch (err) {
        console.log(err);
        return res.send(err)
    }

})

// =================== Order History ================================
// app.get("/orderHistory", (req, res) => {
//     res.render("orderHistory", { layout: false })
// })


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//              Order Processing
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
app.get("/orderProcessing", async (req, res) => {
    try {

        const results = await orderCollection.find({ status: { $ne: "Delivered" } }).lean().exec()

        for (order of results) {
            //find order Total
            let total = 0
            for (item of order.items) {
                const menuItem = await menuCollection.findOne({ name: item }).lean().exec()
                total += menuItem.price
            }
            total += DELIVER_CHARGE

            if (order.driverName !== "") {
                const driver = await driverCollection.findOne({ username: order.driverName }).lean().exec()
                order.driverName = driver.fullName
                order.license = driver.license
            }

            //vars for display purposes
            order.total = total.toFixed(2)
            order.ready = order.status === "RECEIVED" //used to determine showing READY button or not

            //check if an file in public/photo with the name of the confirmation exists
            const fs = require('fs')
            order.hasImage = fs.existsSync(`public/photo/${order.confirmation}.jpg`)
            //console.log(order.hasImage)

            const times = order.dateAndTime.split(":")
            order.time = times[0] + ":" + times[1]

        }
        results.sort((a, b) => {
            const dateA = new Date(a.dateAndTime)
            const dateB = new Date(b.dateAndTime)
            if (dateA < dateB) return 1
            if (dateA > dateB) return -1
            return 0
        })

        return res.render("orderProcessing", { layout: false, orders: results })

    }
    catch (err) {
        console.log(err);
        return res.send(err)
    }

})

app.post("/orderProcessing", async (req, res) => {
    try {

        const searchName = req.body.customerName

        if (searchName === "" || searchName === undefined) {
            return res.redirect("/orderProcessing")
        }


        const results = await orderCollection.find({ status: { $ne: "Delivered" }, customerName: { $regex : new RegExp(searchName, "i") } }).lean().exec()

        if (results.length === 0) {
            return res.render("orderProcessing", { layout: false, orders: results, error: "No Matches Found" })
        }
        else {
            for (order of results) {
                //find order Total
                let total = 0
                for (item of order.items) {
                    const menuItem = await menuCollection.findOne({ name: item }).lean().exec()
                    total += menuItem.price
                }
                total += DELIVER_CHARGE

                if (order.driverName !== "") {
                    const driver = await driverCollection.findOne({ username: order.driverName }).lean().exec()
                    order.driverName = driver.fullName
                    order.license = driver.license
                }

                //vars for display purposes
                order.total = total.toFixed(2)
                order.ready = order.status === "RECEIVED" //used to determine showing READY button or not

                //check if an file in public/photo with the name of the confirmation exists
                const fs = require('fs')
                order.hasImage = fs.existsSync(`public/photo/${order.confirmation}.jpg`)
                //console.log(order.hasImage)

                const times = order.dateAndTime.split(":")
                order.time = times[0] + ":" + times[1]

            }
            results.sort((a, b) => {
                const dateA = new Date(a.dateAndTime)
                const dateB = new Date(b.dateAndTime)
                if (dateA < dateB) return 1
                if (dateA > dateB) return -1
                return 0
            })

            return res.render("orderProcessing", { layout: false, orders: results })
        }
    }
    catch (err) {
        console.log(err);
        return res.send(err)
    }

})

app.get("/ready/:id", async (req, res) => {
    const updateInfo = { status: "READY FOR DELIVERY" }
    const updateId = req.params.id
    try {
        const order = await orderCollection.findOne({ confirmation: updateId })
        await order.updateOne(updateInfo)
        return res.redirect("/orderProcessing")
    }
    catch (err) {
        console.log(err);
        return res.send(err)
    }


})


app.get("/processingHistory", async (req, res) => {
    try {

        const results = await orderCollection.find({ status: "Delivered" }).lean().exec()

        for (order of results) {
            //find order Total
            let total = 0
            for (item of order.items) {
                const menuItem = await menuCollection.findOne({ name: item }).lean().exec()
                total += menuItem.price
            }
            total += DELIVER_CHARGE

            if (order.driverName !== "") {
                const driver = await driverCollection.findOne({ username: order.driverName }).lean().exec()
                order.driverName = driver.fullName
                order.license = driver.license
            }

            //vars for display purposes
            order.total = total.toFixed(2)
            order.ready = order.status === "RECEIVED" //used to determine showing READY button or not

            //check if an file in public/photo with the name of the confirmation exists
            const fs = require('fs')
            order.hasImage = fs.existsSync(`public/photo/${order.confirmation}.jpg`)
            //console.log(order.hasImage)

            const times = order.dateAndTime.split(":")
            order.time = times[0] + ":" + times[1]

        }
        results.sort((a, b) => {
            const dateA = new Date(a.dateAndTime)
            const dateB = new Date(b.dateAndTime)
            if (dateA < dateB) return 1
            if (dateA > dateB) return -1
            return 0
        })

        return res.render("history", { layout: false, orders: results })

    }
    catch (err) {
        console.log(err);
        return res.send(err)
    }

})


app.post("/processingHistory", async (req, res) => {
    try {

        const searchName = req.body.customerName

        if (searchName === "" || searchName === undefined) {
            return res.redirect("/processingHistory")
        }


        const results = await orderCollection.find({ status: "Delivered", customerName:  { $regex : new RegExp(searchName, "i") }}).lean().exec()

        if (results.length === 0) {
            return res.render("history", { layout: false, orders: results, error: "No Matches Found" })
        }
        else {
            for (order of results) {
                //find order Total
                let total = 0
                for (item of order.items) {
                    const menuItem = await menuCollection.findOne({ name: item }).lean().exec()
                    total += menuItem.price
                }
                total += DELIVER_CHARGE

                if (order.driverName !== "") {
                    const driver = await driverCollection.findOne({ username: order.driverName }).lean().exec()
                    order.driverName = driver.fullName
                    order.license = driver.license
                }

                //vars for display purposes
                order.total = total.toFixed(2)
                order.ready = order.status === "RECEIVED" //used to determine showing READY button or not

                //check if an file in public/photo with the name of the confirmation exists
                const fs = require('fs')
                order.hasImage = fs.existsSync(`public/photo/${order.confirmation}.jpg`)
                //console.log(order.hasImage)

                const times = order.dateAndTime.split(":")
                order.time = times[0] + ":" + times[1]

            }
            results.sort((a, b) => {
                const dateA = new Date(a.dateAndTime)
                const dateB = new Date(b.dateAndTime)
                if (dateA < dateB) return 1
                if (dateA > dateB) return -1
                return 0
            })

            return res.render("history", { layout: false, orders: results })
        }
    }
    catch (err) {
        console.log(err);
        return res.send(err)
    }

})

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ 
//                      Driver Page (Johnny)
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

// =================== Login Page ================================

app.get("/login", (req, res) => {
    res.render("login", { layout: false });
});

app.post("/login", async (req, res) => {
    const userNameFromUI = req.body.username;
    const passwordFromUI = req.body.password;

    if (userNameFromUI === undefined ||
        passwordFromUI === undefined ||
        userNameFromUI === "" ||
        passwordFromUI === "") {
        //console.log(`Missing Credentials`)
        // show error is isername or password is not provided or retrieved from form
        return res.render("login", { errorMsg: "Missing Credentials", layout: false })
    }
    try {

        const driver = await driverCollection.findOne({ username: userNameFromUI }).lean().exec()
        //console.log(JSON.stringify(driver))
        if (driver === null) {
            return res.render("login", { errorMsg: "User not found ", layout: false })
        }
        if (userNameFromUI === driver.username &&
            passwordFromUI === driver.password) {
            //console.log(`Login successful for ${driver.username}`)
            // before redirecting user to dashboard, save any necessary information in session
            req.session.driver = {
                uname: driver.username,
                fullName: driver.fullName,
                vModel: driver.vModel,
                vColour: driver.vColour,
                license: driver.license
            }
            req.session.isLoggedIn = true
            // redirect the user toor dashboard upon successful login
            return res.redirect("/openDeliveries")
        } else {
            //console.log("Invalid credentials. Please try again!")
            return res.render("login", {
                errorMsg: "Invalid credentials. Please try again!",
                layout: false
            })
        }
    } catch (err) {
        console.log(err)
    }
})

// =================== Function of ensuring user login first ================
const ensureLogin = (req, res, next) => {
    if (req.session.isLoggedIn !== undefined &&
        req.session.isLoggedIn &&
        req.session.driver !== undefined) {
        //if user has logged in allow them to go to desired endpoint
        next()
    } else {
        //otherwise,ask them to login first
        return res.render("login",
            {
                errorMsg: "You must login first to access dashboard",
                layout: false
            })
    }
}

// ============= Dashboard =================
app.get("/dashboard", ensureLogin, (req, res) => {
    res.render("dashboard", { layout: false })
})

// ====================== List of order ready for transit ======================
app.get("/openDeliveries", ensureLogin, async (req, res) => {
    try {
        const openOrder = await orderCollection.find({ status: "READY FOR DELIVERY" }).lean().exec();
        if (openOrder.length === 0) {
            res.render("openDeliveries", { errorMsg: `No order currently`, layout: false })
        } else {
            res.render("openDeliveries", { layout: false, openOrder: openOrder })
        }
    } catch (err) {
        console.log(err)
    }
})

app.post("/takeOrder/:confirmationId", ensureLogin, async (req, res) => {
    const confirmationId = req.params.confirmationId
    try {
        const customerOrder = await orderCollection.findOne({ confirmation: confirmationId })
        const driver = req.session.driver
        const updateStatus = {
            status: "IN TRANSIT",
            driverName: driver.uname,
        }
        await customerOrder.updateOne(updateStatus)
        res.redirect("/openDeliveries")
    } catch (err) {
        console.log(err)
    }
})

// ===================== Fulfillment Page =======================
app.get("/fulfillment", ensureLogin, async (req, res) => {
    try {
        
        const transitOrder = await orderCollection.find({ status: "IN TRANSIT", driverName:req.session.driver.uname}).lean().exec();
        if (transitOrder.length === 0) {
            res.render("fulfillment", { errorMsg: `No order extracted`, layout: false })
        } else {
            res.render("fulfillment", { layout: false, transitOrder: transitOrder })
        }
    } catch (err) {
        console.log(err)
    }
})

app.post("/orderArrived/:confirmationId", ensureLogin, async (req, res) => {
    const confirmationId = req.params.confirmationId
    try {
        const customerOrder = await orderCollection.findOne({ confirmation: confirmationId })
        const updateStatus = {
            status: "Delivered"
        }
        await customerOrder.updateOne(updateStatus)
        res.redirect("/fulfillment")
    } catch (err) {
        console.log(err)
    }
})

// ======================= Photo upload =======================
app.post("/photoUpload/:confirmationId", ensureLogin, upload.single("photo"), async (req, res) => {
    const formFile = req.file
    formFile.filename = req.params.confirmationId
    if (req.file === undefined) {
        res.render("fulfillment", { errorMsg: `photo not provided with form data`, layout: false })
    }

    if (req.body !== undefined) {

        const photo = { src: `/photo/${formFile.filename}` }

        res.render("fulfillment", { layout: false, uploadedPhoto: "Photo of order delivery uploaded" })
    } else {
        res.render("fulfillment", { errorMsg: `Unable to receive data from form`, layout: false })
    }
})

// ======================= Logout ===========================
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/login")
})

// ----------------
const onHttpStart = () => {
    console.log(`Express web server running on port: ${HTTP_PORT}`)
    console.log(`Press CTRL+C to exit`)
}
app.listen(HTTP_PORT, onHttpStart)
