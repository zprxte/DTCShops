const express = require('express')
const router = express.Router()

router.post('/', (req, res) => {
  const product_ids = Array.isArray(req.body.product_ids) ? req.body.product_ids : []
  if (product_ids.length < 2) {
    return res.status(400).json({ message: 'เลือกสินค้าอย่างน้อย 2 รายการเพื่อเปรียบเทียบ' })
  }
  res.status(201).json({ logged: false })
})

module.exports = router
