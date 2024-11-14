const express = require('express')
const session = require('express-session')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const bodyparser = require('body-parser')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const jalaali = require('jalaali-js')
const upload = require('./upload')
const host = 'http://localhost:3000'
let app = express()

mongoose.connect('mongodb://localhost:27017/boofino_db')

let userSchema = new mongoose.Schema({
	fullname: String,
	username: String,
	passwordHash: String,
	phonenumber: String,
	is_admin: Boolean,
	imgUrl: String,
	wallet: Number,
	schoolId: String,
})

let schoolSchema = new mongoose.Schema({
	schoolId: String,
	name: String,
	address: String,
	city: String,
	state: String,
	imgUrl: String,
	products: [
		{
			name: String,
			imgUrl: String,
			price: Number,
			off: Number,
			group: String,
			finalPrice: Number,
			sellCount: Number,
			itemCount: Number,
			dateTime: Date,
			freeTime: Object,
			oldPrice: Number,
			isDiscount: Boolean,
		},
	],
})

let discountCodeSchema = new mongoose.Schema({
	code: String,
	usageLimit: Number,
	minimumCartPrice: Number,
	percent: Number,
	expirationDate: Date,
})

let orderSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Reference to User
	products: [
		{
			id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, // Reference to Product
			imgUrl: String,
			name: String,
			group: String,
			price: Number,
			quantity: Number,
		},
	],
	totalPrice: Number,
	status: { type: String, default: 'processing' }, // Default status
	trackingCode: Number,
	createdAt: { type: Date, default: Date.now }, // Creation date of the order
})

const User = mongoose.model('User', userSchema)
const School = mongoose.model('School', schoolSchema)
const DiscountCode = mongoose.model('DiscountCode', discountCodeSchema)
const Order = mongoose.model('Order', orderSchema)

app.use('/static', express.static('uploads/'))
app.use(function (req, res, next) {
	// Website you wish to allow to connect
	res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173')

	// Request methods you wish to allow
	res.setHeader(
		'Access-Control-Allow-Methods',
		'GET, POST, OPTIONS, PUT, PATCH, DELETE'
	)

	// Request headers you wish to allow
	res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type')

	// Set to true if you need the website to include cookies in the requests sent
	// to the API (e.g. in case you use sessions)
	res.setHeader('Access-Control-Allow-Credentials', true)

	// Pass to next layer of middleware
	next()
})

app.use(
	session({
		secret: 'this is a secret',
		resave: false,
		saveUninitialized: true,
		cookie: { secure: false },
	})
)
app.use(bodyparser.urlencoded({ extended: false }))
app.use(bodyparser.json())

app.get('/user', async (req, res) => {
	if (!req.session.user) {
		return res
			.status(406)
			.json({ message: 'شما به حساب کاربری خود وارد نشده اید' })
	}

	let getUsername = await User.find({ username: req.session.user.username })

	if (getUsername.length == 0) {
		req.session.user = null
		return res.status(404).json({ message: '404' })
	}
	return res.status(200).json(getUsername)
})

app.put('/user', async (req, res) => {
	try {
		const newUserData = req.body

		if (!req.session.user) {
			return res
				.status(401)
				.json({ message: 'شما به حساب کاربری خود وارد نشده اید' })
		}

		const currentUser = await User.findById(req.session.user._id)

		// Update user profile picture
		newUserData.imgUrl ? (currentUser.imgUrl = newUserData.imgUrl) : false

		// Update user full name
		newUserData.fullname ? (currentUser.fullname = newUserData.fullname) : false

		// Update username
		newUserData.username ? (currentUser.username = newUserData.username) : false

		// Update user phone number
		newUserData.phonenumber
			? (currentUser.phonenumber = newUserData.phonenumber)
			: false

		// Update user wallet price
		newUserData.wallet
			? (currentUser.wallet = currentUser.wallet
					? Number(currentUser.wallet) + Number(newUserData.wallet)
					: Number(newUserData.wallet))
			: false

		// Update user school
		newUserData.schoolId ? (currentUser.schoolId = newUserData.schoolId) : false

		await currentUser.save()

		// Update user session
		req.session.user = currentUser

		res.status(200).send('اطلاعات کاربر با موفقیت به روز شد')
	} catch (error) {
		res.status(500).send('خطا در به روز رسانی اطلاعات کاربر')
	}
})

app.post('/register', async (req, res) => {
	if (req.session.user) {
		return res
			.status(406)
			.json({ message: 'شما از قبل به حساب کاربری خود وارد شده اید' })
	}
	const { fullname, username, password, confirmpassword, phonenumber, imgUrl } =
		req.body
	if (!fullname || !username || !password || !confirmpassword || !phonenumber) {
		return res.status(400).json({ message: 'لطفا تمام اطلاعات را وارد کنید' })
	}

	if (password !== confirmpassword) {
		return res.status(406).json({ message: 'رمز ها با یکدیگر تطابق ندارند' })
	}
	if (password.length < 8) {
		return res.status(406).json({
			message: 'تعداد کاراکتر های رمز عبور باید بیشتر از 8 کاراکتر باشد',
		})
	}
	let checkUser = await User.find({ username })
	if (checkUser.length > 0) {
		return res.status(406).json({ message: 'این نام کاربری از قبل وجود دارد' })
	}
	const passwordhash = bcrypt.hashSync(password, 10)

	let newUser = new User({
		fullname,
		username,
		passwordHash: passwordhash,
		phonenumber,
		is_admin: false,
		imgUrl,
		wallet: 0,
		schoolId: null,
	})
	await newUser.save()
	req.session.user = newUser
	return res
		.status(201)
		.json({ message: 'حساب کاربری شما با موفقیت ثبت گردید' })
})

app.post('/login', async (req, res) => {
	if (req.session.user) {
		return res
			.status(406)
			.json({ message: 'شما از قبل به حساب کاربری خود وارد شده اید' })
	}
	const { username, password } = req.body
	if (!username || !password) {
		return res.status(400).json({ message: 'لطفا تمام فیلد ها را پر کنید' })
	}
	let userData = await User.find({ username })
	if (userData.length > 0) {
		if (bcrypt.compareSync(password, userData[0].passwordHash)) {
			req.session.user = userData[0]
			return res
				.status(202)
				.json({ message: 'شما به حساب کاربری خود وارد شدید' })
		} else {
			return res.status(406).json({ message: 'رمز عبور شما اشتباه است' })
		}
	} else {
		return res.status(406).json({ message: 'نام کاربری شما اشتباه است' })
	}
})

app.get('/logout', (req, res) => {
	req.session.user = null
	res.status(202).json({ message: 'با موفقیت از حساب کاربری خود خارج شدید' })
})

// Set discount to product
app.post('/discount', async (req, res) => {
	const { code } = req.body
	const now = new Date()

	if (!code) {
		return res.status(400).json({ message: 'لطفا کد تخفیف را وارد کنید' })
	}

	try {
		const discountCode = await DiscountCode.find({ code: code })

		if (discountCode.length === 0) {
			return res.status(404).json({ message: 'کد تخفیف یافت نشد' })
		}
		if (discountCode.expirationDate > now) {
			return res
				.status(400)
				.json({ message: 'زمان استفاده از کد تخفیف به پایان رسیده' })
		}

		return res.status(200).json(discountCode.percent)
	} catch (error) {
		return res.status(500).json({ message: 'خطا در دریافت کد تخفیف' })
	}
})

// Order registration from the user
app.post('/buyproducts', async (req, res) => {
	const { products, totalPrice } = req.body

	// Check if user is logged in
	if (!req.session.user) {
		return res
			.status(401)
			.json({ message: 'شما به حساب کاربری خود وارد نشده‌اید' })
	}

	const user = req.session.user
	const schoolId = user.schoolId

	if (!schoolId) {
		return res.status(400).json({ message: 'شما هنوز به مدرسه‌ای متصل نیستید' })
	}

	// Validate input
	if (!products || !Array.isArray(products) || !totalPrice) {
		return res.status(400).json({ message: 'لطفا تمام اطلاعات را وارد کنید' })
	}

	try {
		// Retrieve user from session and database
		const user = await User.findById(req.session.user._id)

		// Check if user's wallet has enough money
		if (user.wallet < totalPrice) {
			return res.status(400).json({ message: 'موجودی کیف پول شما کافی نیست' })
		}

		// Find user's school
		const school = await School.findOne({ schoolId: user.schoolId })
		if (!school) {
			return res.status(404).json({ message: 'مدرسه یافت نشد' })
		}

		// Calculate total price from the products and validate stock
		let calculatedTotalPrice = 0

		for (let i = 0; i < products.length; i++) {
			const { id, count } = products[i]
			const product = school.products.find((prod) => prod._id == id)
			if (!product) {
				return res
					.status(404)
					.json({ message: `محصول با شناسه ${id} یافت نشد.` })
			}

			if (product.itemCount < count) {
				return res.status(400).json({
					message: `موجودی کافی برای محصول ${product.name} وجود ندارد`,
				})
			}
			calculatedTotalPrice += product.finalPrice * count
			product.itemCount -= count
		}

		// Validate total price
		if (totalPrice !== calculatedTotalPrice) {
			return res.status(400).json({ message: 'عدم تطابق قیمت کل' })
		}

		// Deduct total price from user's wallet
		if (user.wallet >= totalPrice) {
			user.wallet -= totalPrice
		} else {
			return res.status(400).json({
				message: 'موجودی شما کافی نمی‌باشد! لطفا کیف پول خودرا شارژ نمایید',
			})
		}

		await user.save()

		// Save the updated school with new product data
		await school.save()

		// Convert the current date to Jalaali (Persian date)
		const currentDate = new Date()
		const jalaaliDate = jalaali.toJalaali(currentDate)
		const createdAtJalaali =
			`${jalaaliDate.jy}/${jalaaliDate.jm}/${jalaaliDate.jd} ` +
			`${currentDate.getHours().toString()}:` +
			`${currentDate.getMinutes().toString()}:` +
			`${currentDate.getSeconds().toString()}`

		// Create and save the new order with Jalaali date
		const newOrder = new Order({
			userId: user._id,
			products: products.map((p) => {
				const product = school.products.find((prod) => prod._id == p.id)
				return {
					id: p.id,
					name: product.name,
					imgUrl: product.imgUrl,
					price: product.finalPrice,
					quantity: p.count,
				}
			}),
			totalPrice: calculatedTotalPrice,
			trackingCode: Math.floor(1000 + Math.random() * 9000),
			createdAt: createdAtJalaali,
		})
		await newOrder.save()

		return res.status(200).json({
			message: 'خرید با موفقیت انجام شد',
			trackingCode: newOrder.trackingCode,
		})
	} catch (error) {
		return res.status(500).json({
			message: 'خطا در پردازش خرید. لطفا دوباره تلاش کنید',
			error: error.message,
		})
	}
})

// Get all user orders
app.get('/userorders', async (req, res) => {
	if (!req.session.user) {
		return res
			.status(406)
			.json({ message: 'شما به حساب کاربری خود وارد نشده اید' })
	}

	const user = req.session.user
	const schoolId = user.schoolId

	if (!schoolId) {
		return res.status(400).json({ message: 'شما هنوز به مدرسه‌ای متصل نیستید' })
	}

	try {
		const orders = await Order.find({ userId: req.session.user._id })

		if (!orders.length) {
			return res.status(404).json({ message: 'هیچ سفارشی یافت نشد' })
		}

		return res.status(200).json(orders)
	} catch (error) {
		return res.status(500).json({
			message: 'خطا در بازیابی سفارشات. بعدا دوباره تلاش کنید',
			error: error.message,
		})
	}
})

// Get order buy tracking code
app.get('/order/:trackingCode', async (req, res) => {
	const { trackingCode } = req.params

	try {
		const order = await Order.findOne({ trackingCode })

		if (!order) {
			return res.status(404).json({ message: 'سفارشی با این کد یافت نشد' })
		}

		res.status(200).json({
			products: order.products,
			totalPrice: order.totalPrice,
			status: order.status,
			createdAt: order.createdAt,
		})
	} catch (error) {
		res
			.status(500)
			.json({ message: 'خطا در بازیابی سفارش', error: error.message })
	}
})

// Add new product to school
app.post('/addproduct', async (req, res) => {
	if (!req.session.user) {
		return res
			.status(401)
			.json({ message: 'شما به حساب کاربری خود وارد نشده اید' })
	}

	const {
		name,
		imgUrl,
		price,
		off,
		group,
		finalPrice,
		sellCount,
		itemCount,
		freeTime,
		oldPrice,
		isDiscount,
	} = req.body

	const currentDate = new Date()
	const jalaaliDate = jalaali.toJalaali(currentDate)

	// Formating time
	const dateTime = `${jalaaliDate.jy}/${jalaaliDate.jm}/${jalaaliDate.jd + 1}`

	try {
		// Find the user's school and update the products array
		const user = req.session.user

		if (!user.is_admin) {
			return res
				.json(
					{ message: 'شما دسترسی لازم برای اضافه کردن محصول را ندارید' },
					409
				)
				.end()
		}

		if (user.schoolId) {
			const schoolId = user.schoolId
			const school = await School.findOne({ schoolId: schoolId })

			const exitingProduct = school.products.find(
				(product) => product.name === name
			)

			if (exitingProduct) {
				return res
					.json({ message: 'محصولی با این نام از قبل وجود دارد' }, 409)
					.end()
			}

			if (school) {
				// Create a new product object
				const newProduct = {
					name,
					imgUrl,
					price,
					off,
					group,
					finalPrice,
					sellCount,
					itemCount,
					dateTime,
					freeTime,
					oldPrice,
					isDiscount,
				}

				// Add the product to the school's products array
				school.products.push(newProduct)
				await school.save()

				return res.status(201).json({
					message: 'محصول با موفقیت اضافه شد',
				})
			} else {
				return res.status(404).json({ message: 'مدرسه مربوطه یافت نشد' })
			}
		} else {
			return res.status(400).json({ message: 'کاربر به مدرسه‌ای متصل نیست' })
		}
	} catch (error) {
		return res
			.status(500)
			.json({ message: 'خطا در افزودن محصول', error: error.message })
	}
})

// Edit product
app.put('/editproduct/:name', async (req, res) => {
	const user = req.session.user

	if (!user) {
		return res
			.status(401)
			.json({ message: 'شما به حساب کاربری خود وارد نشده اید' })
	}
	if (!user.is_admin) {
		return res
			.status(409)
			.json({ message: 'شما دسترسی لازم برای ویرایش محصول را ندارید' })
	}

	const schoolId = user.schoolId
	const school = await School.findOne({ schoolId: schoolId })

	if (!school) {
		return res.status(404).json({ message: 'مدرسه یافت نشد' })
	}

	const productName = req.params.name
	const product = school.products.find(
		(product) => product.name === productName
	)

	if (!product) {
		return res.status(404).json({ message: 'محصولی با این نام یافت نشد' })
	}

	const {
		name,
		imgUrl,
		price,
		off,
		group,
		finalPrice,
		sellCount,
		itemCount,
		dateTime,
		freeTime,
		oldPrice,
		isDiscount,
	} = req.body

	if (name) product.name = name
	if (imgUrl) product.imgUrl = imgUrl
	if (price !== undefined) product.price = price
	if (off !== undefined) product.off = off
	if (group) product.group = group
	if (finalPrice !== undefined) product.finalPrice = finalPrice
	if (sellCount !== undefined) product.sellCount = sellCount
	if (itemCount !== undefined) product.itemCount = itemCount
	if (dateTime) product.dateTime = dateTime
	if (freeTime) product.freeTime = freeTime
	if (oldPrice !== undefined) product.oldPrice = oldPrice
	if (isDiscount !== undefined) product.isDiscount = isDiscount

	try {
		await school.save()
		return res
			.status(200)
			.json({ message: 'محصول با موفقیت به‌روزرسانی شد', product })
	} catch (error) {
		return res
			.status(500)
			.json({ message: 'خطا در به‌روزرسانی محصول', error: error.message })
	}
})

// Delete product
app.delete('/deleteproduct/:name', async (req, res) => {
	const user = req.session.user

	if (!user) {
		return res
			.status(401)
			.json({ message: 'شما به حساب کاربری خود وارد نشده اید' })
	}
	if (!user.is_admin) {
		return res
			.status(409)
			.json({ message: 'شما دسترسی لازم برای ویرایش محصول را ندارید' })
	}

	const schoolId = user.schoolId
	const school = await School.findOne({ schoolId: schoolId })

	if (!school) {
		return res.status(404).json({ message: 'مدرسه یافت نشد' })
	}

	const productName = req.params.name
	const productIndex = school.products.findIndex(
		(product) => product.name === productName
	)

	if (productIndex === -1) {
		return res.status(404).json({ message: 'محصولی با این نام یافت نشد' })
	}

	try {
		const removedProduct = school.products.splice(productIndex, 1)
		await school.save()
		return res.status(200).json({ message: 'محصول با موفقیت حذف شد' })
	} catch (error) {
		return res.status(500).json({ message: 'خطا در حذف محصول' })
	}
})

// Delete products with product list name
app.delete('/deleteproducts', async (req, res) => {
	const user = req.session.user

	if (!user) {
		return res
			.status(401)
			.json({ message: 'شما به حساب کاربری خود وارد نشده اید' })
	}
	if (!user.is_admin) {
		return res
			.status(409)
			.json({ message: 'شما دسترسی لازم برای ویرایش محصول را ندارید' })
	}

	const schoolId = user.schoolId
	const school = await School.findOne({ schoolId: schoolId })

	if (!school) {
		return res.status(404).json({ message: 'مدرسه یافت نشد' })
	}

	const productNames = req.body.productNames

	if (!Array.isArray(productNames)) {
		return res.status(400).json({ message: 'لیست نام محصولات معتبر نمی‌باشد' })
	}

	try {
		let removedProducts = []

		productNames.forEach((productName) => {
			const productIndex = school.products.findIndex(
				(product) => product.name === productName
			)

			if (productIndex !== -1) {
				const removedProduct = school.products.splice(productIndex, 1)
				removedProducts.push(removedProduct[0])
			}
		})

		await school.save()

		if (removedProducts.length === 0) {
			return res
				.status(404)
				.json({ message: 'هیچ محصولی با این نام‌ها یافت نشد' })
		}

		return res.status(200).json({ message: 'محصولات با موفقیت حذف شدند' })
	} catch (error) {
		return res.status(500).json({ message: 'خطا در حذف محصولات' })
	}
})

// Get school products
app.get('/products', async (req, res) => {
	if (!req.session.user) {
		return res
			.status(406)
			.json({ message: 'شما به حساب کاربری خود وارد نشده اید' })
	}

	const user = req.session.user
	const schoolId = user.schoolId

	if (!schoolId) {
		return res.status(400).json({ message: 'شما هنوز به مدرسه‌ای متصل نیستید' })
	}

	try {
		const school = await School.findOne({ schoolId: schoolId })

		if (!school) {
			return res.status(404).json({ message: 'مدرسه یافت نشد' })
		}

		if (!school.products) {
			return res.status(404).json({ message: 'محصولی وجود ندارد' })
		}

		return res.status(200).json(school.products)
	} catch (error) {
		return res.status(500).json({ message: 'خطا در بازیابی محصولات' })
	}
})

// Get product with product name
app.get('/product/:name', async (req, res) => {
	const user = req.session.user

	if (!user) {
		return res
			.status(401)
			.json({ message: 'شما به حساب کاربری خود وارد نشده اید' })
	}

	const schoolId = user.schoolId
	const school = await School.findOne({ schoolId: schoolId })

	if (!school) {
		return res.status(404).json({ message: 'مدرسه یافت نشد' })
	}

	const productName = req.params.name
	const product = school.products.find(
		(product) => product.name === productName
	)

	if (!product) {
		return res.status(404).json({ message: 'محصولی با این نام یافت نشد' })
	}

	return res.status(200).json(product)
})

// Search products
app.get('/search-products/:name', async (req, res) => {
	const user = req.session.user

	if (!user) {
		return res
			.status(401)
			.json({ message: 'شما به حساب کاربری خود وارد نشده‌اید' })
	}

	const productName = req.params.name

	if (!req.params) {
		return res
			.status(400)
			.json({ message: 'لطفاً یک کلمه برای جستجو وارد کنید' })
	}

	const schoolId = user.schoolId

	if (!schoolId) {
		return res.status(400).json({ message: 'شما هنوز به مدرسه‌ای متصل نیستید' })
	}

	try {
		const school = await School.findOne({ schoolId: schoolId })

		if (!school) {
			return res.status(404).json({ message: 'مدرسه یافت نشد' })
		}

		if (!school.products) {
			return res.status(404).json({ message: 'محصولی وجود ندارد' })
		}

		const regex = new RegExp(productName, 'i')
		const filteredProducts = school.products.filter((product) =>
			regex.test(product.name)
		)

		if (filteredProducts.length === 0) {
			return res.status(404).json({ message: 'محصولی یافت نشد' })
		}

		return res.status(200).json(filteredProducts)
	} catch (error) {
		return res
			.status(500)
			.json({ message: 'خطا در بازیابی محصولات', error: error.message })
	}
})

// Get schools list
app.get('/schools', async (req, res) => {
	try {
		const schools = await School.find()
		if (schools.length <= 0) {
			return res.status(404).json({ error: 'مدرسه ای یافت نشد' })
		}
		return res.json(schools)
	} catch (error) {
		return res.status(500).json({ error: 'خطا در اتصال' })
	}
})

// Search schools
app.post('/search-schools', async (req, res) => {
	const { city, state, name } = req.body

	if (!city || !state || !name) {
		return res.status(400).json({ message: 'لطفاً تمام اطلاعات را وارد کنید' })
	}

	try {
		const schools = await School.find({
			city: city,
			state: state,
			name: new RegExp(name, 'i'),
		}).select('-products')

		if (schools.length === 0) {
			return res.status(404).json({ message: 'مدرسه‌ای یافت نشد' })
		}

		return res.status(200).json(schools)
	} catch (error) {
		return res.status(500).json({ message: 'خطا در جستجوی مدارس' })
	}
})

// Post image to database
app.post('/uploadimg', upload.single('imgUrl'), async (req, res) => {
	try {
		return res.json({ message: host + '/static/' + req.file.filename }, 201).end
	} catch {
		return res.json({ message: 'لطفا در درج اطلاعات دقت حاصل نمایید' }, 400).end
	}
})

// Security
app.use(helmet())
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // limit each IP to 100 requests per windowMs
})
app.use(limiter)

app.listen(3000)
