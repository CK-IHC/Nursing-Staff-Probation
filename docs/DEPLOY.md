# Deploy / เชื่อมต่อ Frontend กับ Backend (Google Apps Script)

ระบบนี้ไม่มี database แยกต่างหาก — backend คือ Google Apps Script Web App
ที่อ่าน/เขียนข้อมูลลง Google Sheets โดยตรง (ดู `apps-script/Data.gs`) ส่วน
frontend คือ static site ที่ deploy บน Cloudflare Worker (`ckihcdeploystage/`)
เรียก backend ผ่าน URL เดียวคือค่า `API_BASE` ใน
`ckihcdeploystage/frontend/js/config.js`

ถ้าหน้าเว็บขึ้น **"เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตหรือ API URL"**
แปลว่า browser ยิง request ไปที่ `API_BASE` แล้วไม่ได้รับ response กลับมาเลย
(ไม่ใช่ error จาก database) ให้ไล่เช็คตามลำดับด้านล่าง

## 1. Deploy Google Apps Script

1. เปิด Google Sheet ที่ต้องการใช้เป็น database → Extensions → Apps Script
2. คัดลอกไฟล์ทั้งหมดใน `apps-script/*.gs` เข้าไปในโปรเจกต์ (ชื่อไฟล์ต้องตรงกัน)
3. แก้ `SHEET_ID` ใน `Code.gs` ให้เป็น ID ของ Google Sheet ที่เปิดอยู่
   (ID คือส่วนที่อยู่ระหว่าง `/d/` กับ `/edit` ใน URL ของชีต)
4. Project Settings → Script Properties → เพิ่ม:
   - `TOKEN_SECRET` — สุ่มสตริงยาว ๆ (ใช้เซ็น session token, ขาดไม่ได้)
   - `ANTHROPIC_API_KEY` — ไม่บังคับ ใช้เฉพาะฟีเจอร์ AI Coach
5. Deploy → New deployment → เลือกประเภท **Web app**
   - **Execute as: Me**
   - **Who has access: Anyone** ← สำคัญที่สุด ถ้าตั้งเป็นอย่างอื่น (เช่น
     "Anyone with Google account" หรือจำกัดเฉพาะองค์กร) เบราว์เซอร์ของผู้ใช้
     จะถูก Google redirect ไปหน้า login แทนที่จะได้ JSON กลับมา ซึ่ง fetch()
     ฝั่ง frontend จะเห็นเป็น network error พอดีกับ error "เชื่อมต่อเซิร์ฟเวอร์
     ไม่สำเร็จ" ที่เจอ
6. คัดลอก URL ที่ได้ (ลงท้ายด้วย `/exec`)

## 2. อัปเดต config.js ฝั่ง frontend

แก้ `ckihcdeploystage/frontend/js/config.js`:

```js
window.APP_CONFIG = {
  API_BASE: 'https://script.google.com/macros/s/XXXXXXXX/exec',
};
```

ต้องเป็น URL จาก deployment **ล่าสุด**ที่ active อยู่จริง แล้ว deploy Worker
ใหม่ (`npm run deploy` ใน `ckihcdeploystage/`) เพราะไฟล์นี้เป็น static asset
— แก้ที่ repo อย่างเดียวไม่มีผลจนกว่าจะ deploy ทับของเดิม

## 3. ทดสอบว่าเชื่อมสำเร็จหรือยัง

เปิด `{API_BASE}?path=/api/setup/status` ตรง ๆ ในเบราว์เซอร์ (ไม่ต้อง login)
ควรได้ JSON กลับมาแบบ:

```json
{ "success": true, "data": { "codeVersion": "...", "hasAnyStaff": ..., "deployedCodeUpToDate": true } }
```

- ได้ JSON กลับมาปกติ → backend เชื่อมกับ Google Sheet เรียบร้อย ปัญหาน่าจะ
  อยู่ที่ `API_BASE` ใน config.js ไม่ตรงกับ URL นี้ (deploy คนละตัว/URL เก่า)
- ได้หน้า Google login หรือหน้า "Sorry, unable to open the file" → กลับไปแก้
  ข้อ 1.5 (Who has access) หรือ `SHEET_ID`
- เปิดไม่ขึ้นเลย/timeout → deployment ถูกลบหรือยังไม่เคย deploy จริง ให้ทำ
  ข้อ 1 ใหม่ทั้งหมด

## หมายเหตุ: ชีต Admins (แยกจากชีต Staff)

ตั้งแต่ backend เวอร์ชัน v28 เป็นต้นไป บัญชี Admin เก็บอยู่ในชีต **Admins** แยก
ต่างหากจากชีต **Staff** โดยเด็ดขาด (ดู `apps-script/Admins.gs`) — ครั้งแรกที่
deploy โค้ดเวอร์ชันนี้ทับของเดิม ให้เปิด `{API_BASE}?path=/api/setup/status`
หรือกดปุ่ม "รันซ่อมแซมโครงสร้างชีต" ในหน้า Settings อย่างน้อยหนึ่งครั้ง เพื่อให้
ระบบสร้างชีต Admins และย้ายบัญชี Admin เดิม (แถวในชีต Staff ที่มี Role=Admin)
มาไว้ที่นี่โดยอัตโนมัติ — ไม่ทำก็ไม่เป็นไร เพราะระบบจะย้ายให้เองทันทีที่มีคน
ล็อกอินด้วยบัญชี Admin เดิมอยู่ดี แค่ทำก่อนช่วยให้ชัวร์กว่า

## สาเหตุที่พบบ่อยที่สุดของ "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ"

1. **แก้โค้ด backend แล้วกด Deploy → New deployment** (แทนที่จะกด Manage
   deployments → แก้ deployment เดิม) — จะได้ URL `/exec` ใหม่ทุกครั้ง ถ้า
   `config.js` ยังชี้ไป URL เก่า ก็จะเชื่อมต่อไม่ได้ทันที เพราะ deployment เก่า
   ไม่ได้รันโค้ดล่าสุด (หรือถูกลบไปแล้ว)
2. **Who has access ไม่ได้ตั้งเป็น Anyone**
3. **`SHEET_ID` ใน `Code.gs` ไม่ตรงกับชีตที่ deploy Apps Script อยู่** (เช่น
   คัดลอกโปรเจกต์ไปคนละไฟล์)
