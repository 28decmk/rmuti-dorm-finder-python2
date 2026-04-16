let selectedFiles = []; // ตัวแปรเก็บไฟล์รูปภาพ
// ตัวแปรเก็บ ID หอพักที่กำลังแก้ไข (null หมายถึงกำลังเพิ่มใหม่)
let currentEditingDormId = null;

// เพิ่มตัวแปรไว้ด้านบนสุดของไฟล์ owner.js เพื่อเก็บข้อมูลหอพักทั้งหมด
let allDorms = [];

let deletedImageIds = []; // เก็บ ID รูปที่จะลบ

// เพิ่มตัวแปรไว้ด้านบนสุดของไฟล์ owner.js
let myCurrentUserId = null;

let notificationSocket = null;

let allStatsData = null; // เก็บข้อมูลทั้งหมดไว้ที่นี่




// ฟังก์ชั่นเพิ่มหอพัก
function openAddDormModal() {
    // 1. ล้างสถานะการแก้ไข (สำคัญมาก)
    currentEditingDormId = null;
    deletedImageIds = [];
    selectedFiles = []; // ล้างไฟล์ที่เคยเลือกค้างไว้
    
    // 2. ล้างข้อมูลใน Form และ Preview รูปภาพ
    const dormForm = document.getElementById('dorm-form');
    if (dormForm) dormForm.reset(); 
    
    const previewContainer = document.getElementById('image-preview');
    if (previewContainer) previewContainer.innerHTML = ''; // ล้างรูปภาพที่ค้างในหน้าจอ
    
    // 3. เปลี่ยนหัวข้อ Modal และ "คืนค่า" ปุ่มให้กลับมาเป็นการเพิ่มข้อมูล (POST)
    const modalTitle = document.querySelector("#addDormModal h3");
    if (modalTitle) modalTitle.innerText = "ลงทะเบียนหอพักใหม่";

    const submitBtn = document.querySelector("#addDormModal button[type='submit']") || 
                      document.querySelector("#addDormModal button[onclick*='submitAddDorm']");
    
    if (submitBtn) {
        submitBtn.innerText = "ลงทะเบียนหอพัก";
        // ตรวจสอบให้แน่ใจว่าปุ่มเรียกใช้ submitAddDorm(event)
        submitBtn.setAttribute("onclick", "submitAddDorm(event)");
    }
    
    // 4. แสดง Modal
    const modal = document.getElementById('addDormModal');
    if (modal) {
        modal.classList.remove('hidden');
    } else {
        console.error("ไม่พบ Element ID 'addDormModal'");
    }
}

document.getElementById('dorm-images').addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    const previewContainer = document.getElementById('image-preview');

    files.forEach(file => {
        // 1. ตรวจสอบจำนวน (ไม่เกิน 5)
        if (selectedFiles.length >= 5) {
            alert("อัปโหลดได้สูงสุด 5 รูปเท่านั้นครับ");
            return;
        }

        // 2. ตรวจสอบขนาด (ไม่เกิน 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert(`ไฟล์ ${file.name} ใหญ่เกิน 5MB ครับ`);
            return;
        }

        // 3. ตรวจสอบนามสกุลไฟล์
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            alert(`ไม่รองรับไฟล์ประเภท ${file.type}`);
            return;
        }

        selectedFiles.push(file);

        // แสดง Preview
        const reader = new FileReader();
        reader.onload = function(event) {
            const div = document.createElement('div');
            div.className = "relative h-16 rounded-xl overflow-hidden shadow-sm border border-slate-100";
            div.innerHTML = `
                <img src="${event.target.result}" class="w-full h-full object-cover">
                <button type="button" onclick="removeImage(${selectedFiles.length - 1})" class="absolute top-0 right-0 bg-red-500 text-white rounded-bl-lg p-0.5 hover:bg-red-600">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            `;
            previewContainer.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
});

function removeImage(index) {
    selectedFiles.splice(index, 1);
    renderPreviews();
}

function renderPreviews() {
    const previewContainer = document.getElementById('image-preview');
    previewContainer.innerHTML = '';
    selectedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const div = document.createElement('div');
            div.className = "relative h-16 rounded-xl overflow-hidden shadow-sm border border-slate-100";
            div.innerHTML = `
                <img src="${e.target.result}" class="w-full h-full object-cover">
                <button type="button" onclick="removeImage(${index})" class="absolute top-0 right-0 bg-red-500 text-white rounded-bl-lg p-0.5">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            `;
            previewContainer.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}


// ฟังก์ชันสำหรับส่งข้อมูล (รวมทั้งเพิ่มและแก้ไข)
async function submitAddDorm(event) {
    event.preventDefault();

    // --- เพิ่มส่วน Confirmation ตรงนี้ ---
    if (currentEditingDormId) {
        const isConfirmed = confirm("⚠️ การแก้ไขข้อมูลจะทำให้สถานะหอพักถูกเปลี่ยนเป็น 'รอตรวจสอบ' และข้อมูลจะยังไม่แสดงผลจนกว่าแอดมินจะอนุมัติใหม่ คุณต้องการดำเนินการต่อหรือไม่?");
        if (!isConfirmed) return; // ถ้ากดยกเลิก ก็หยุดการทำงาน ไม่ส่ง API
    }
    // --------------------------------

    // --- 1. ตรวจสอบข้อมูลเบื้องต้น (Validation) ---
    const dormName = document.getElementById('dorm-name').value.trim();
    const priceStart = document.getElementById('price-start').value;
    const contactNumber = document.getElementById('contact-number').value.trim();

    // --- 2. ตรวจสอบข้อมูลแบบละเอียด (Validation) ---
    if (!dormName) {
        alert("กรุณาระบุชื่อหอพัก");
        return; 
    }
    
    // เช็คว่าเป็นตัวเลขไหม และต้องมากกว่า 0
    if (!priceStart || isNaN(priceStart) || parseFloat(priceStart) <= 0) {
        alert("กรุณาระบุราคาเริ่มต้นให้ถูกต้อง (ต้องเป็นตัวเลขที่มากกว่า 0)");
        return;
    }

    // เช็คความยาวเบอร์โทรศัพท์ (ปกติ 9-10 หลัก)
    if (contactNumber.length < 9) {
        alert("กรุณาระบุเบอร์โทรศัพท์ให้ถูกต้อง (อย่างน้อย 9 หลัก)");
        return;
    }

    // ดึงปุ่ม Submit เพื่อเปลี่ยนสถานะป้องกันการกดซ้ำ
    const submitBtn = event.target.querySelector("button[type='submit']") || 
                      document.querySelector("button[onclick='submitAddDorm(event)']");
    const originalBtnText = submitBtn.innerText;
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="inline-block animate-spin mr-2">⏳</span> กำลังบันทึก...`;

    const formData = new FormData();
    // ... ดึงค่าจาก Input ต่างๆ ใส่ formData เหมือนเดิม ...
    formData.append('name', document.getElementById('dorm-name').value);
    formData.append('dorm_type', document.getElementById('dorm-type').value);
    formData.append('room_type', document.getElementById('room-type').value);
    formData.append('distance_to_rmuti', document.getElementById('distance-to-rmuti').value);
    formData.append('vacancy_count', document.getElementById('vacancy-count').value);
    formData.append('price_start', document.getElementById('price-start').value);
    formData.append('google_map_link', document.getElementById('google-map').value);
    formData.append('contact_number', document.getElementById('contact-number').value);
    formData.append('line_id', document.getElementById('line-id').value);
    formData.append('address', document.getElementById('address').value);
    formData.append('description', document.getElementById('description').value);

    // Boolean Flags (สิ่งอำนวยความสะดวก)
    formData.append('has_wifi', document.getElementById('has-wifi').checked);
    formData.append('has_air_conditioner', document.getElementById('has-air').checked);
    formData.append('has_parking', document.getElementById('has-parking').checked);
    formData.append('has_laundry', document.getElementById('has-laundry').checked);
    formData.append('is_pet_friendly', document.getElementById('is-pet').checked);
    formData.append('has_keycard', document.getElementById('has-keycard').checked);
    formData.append('has_cctv', document.getElementById('has-cctv').checked);
    formData.append('has_security_guard', document.getElementById('has-security').checked);
    formData.append('has_water_heater', document.getElementById('has-water-heater').checked);
    formData.append('has_refrigerator', document.getElementById('has-fridge').checked);
    formData.append('has_furniture', document.getElementById('has-furniture').checked);
    formData.append('has_elevator', document.getElementById('has-elevator').checked);
    formData.append('has_fitness', document.getElementById('has-fitness').checked);
    formData.append('has_drinking_water', document.getElementById('has-drinking-water').checked);


    // --- ส่วนที่ต้องเพิ่ม: จัดการรูปภาพใหม่ที่เลือก (selectedFiles) ---
    // เช็คว่ามีไฟล์ใน selectedFiles (ตัวแปร Global ที่คุณเก็บไว้ตอนเลือกรูป) หรือไม่
    if (selectedFiles && selectedFiles.length > 0) {
        selectedFiles.forEach((file) => {
            // สำคัญ: ต้องชื่อ 'images' (มี s) เพื่อให้ตรงกับ Python (List[UploadFile])
            formData.append('images', file);
        });
    }
    // --------------------------------------------------------

    // *** จุดสำคัญอยู่ตรงนี้ ***
    let url = `${window.location.origin}/api/owner/add-dorm`;
    let method = 'POST';

    // ถ้ามี ID ค้างอยู่ แสดงว่าเรากำลัง "แก้ไข"
    if (currentEditingDormId) {
        url = `${window.location.origin}/api/owner/update-dorm/${currentEditingDormId}`;
        method = 'PUT';
        
        // ส่ง ID รูปภาพที่จะลบ (ถ้ามี)
        formData.append('delete_image_ids', JSON.stringify(deletedImageIds || []));
    }

    // Debug ดูหน่อยว่า URL ที่จะยิงไปคืออะไร
    console.log(`🚀 Sending ${method} request to: ${url}`);

    try {
        const response = await fetch(url, {
            method: method,
            body: formData,
            // ไม่ต้องใส่ Header Content-Type เพราะ FormData จัดการให้เอง
        });

        if (response.ok) {
            const msg = currentEditingDormId ? "อัปเดตข้อมูลและส่งให้แอดมินตรวจสอบใหม่แล้ว!" : "เพิ่มหอพักสำเร็จ!";
            
            // 1. แสดงการแจ้งเตือนทันที
            if (typeof showToast === "function") {
                showToast("สำเร็จ", msg);
            } else {
                console.log("✅ " + msg);
            }

            // 2. ปิด Modal (ครอบด้วย try...catch เพื่อป้องกัน Error ขัดจังหวะการโหลดข้อมูล)
            try {
                closeAddDormModal();
            } catch (closeError) {
                // หากปิด Modal พลาด (เช่น หา Element ไม่เจอ) ให้ Log ไว้แต่ไม่ต้องหยุดทำงาน
                console.error("❌ การปิด Modal เกิดข้อผิดพลาด แต่ระบบจะดำเนินการต่อ:", closeError);
            }

            // 3. ล้างสถานะตัวแปรต่างๆ ทันที
            selectedFiles = [];
            currentEditingDormId = null; 
            deletedImageIds = [];

            // 4. โหลดข้อมูลใหม่ (Real-time Update)
            // การใช้ await ตรงนี้สำคัญมาก เพื่อให้ตารางอัปเดตก่อนคืนค่าปุ่ม
            try {
                await loadMyDorms(); 
                console.log("🔄 ข้อมูลในหน้าจอถูกอัปเดตเรียบร้อยแล้ว");
            } catch (loadError) {
                console.error("❌ ไม่สามารถโหลดข้อมูลใหม่ได้:", loadError);
            }

            // 5. คืนค่าปุ่มให้กลับมาใช้งานได้ปกติ
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = originalBtnText;
            }
        } else {
            const error = await response.json();
            alert("ผิดพลาด: " + (error.detail || "ไม่สามารถบันทึกข้อมูลได้"));
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
        }
    } catch (err) {
        console.error(err);
        // เช็คว่า Error เกิดจากการที่เรา Close หน้าจอเองหรือเปล่า
        if (err.name !== 'AbortError') {
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
        }
        submitBtn.disabled = false;
        submitBtn.innerText = originalBtnText;
    }
}


// ฟังก์ชันช่วยคืนค่าปุ่ม
function resetBtn(btn) {
    btn.disabled = false;
    btn.innerHTML = "ยืนยันการเพิ่มหอพัก";
    btn.classList.remove('opacity-50', 'cursor-not-allowed');
}

function closeAddDormModal() {
    // 1. ปิด Modal (เช็คก่อนว่ามี element นี้จริงไหม)
    const modal = document.getElementById('addDormModal');
    if (modal) {
        modal.classList.add('hidden');
    } else {
        console.error("❌ ไม่พบ Modal ID: addDormModal");
    }

    // 2. ล้างข้อมูลในฟอร์ม (เช็คก่อนสั่ง reset เพื่อป้องกัน Error)
    const form = document.getElementById('dorm-form');
    if (form) {
        form.reset(); 
    } else {
        console.warn("⚠️ ไม่พบ Form ID: dorm-form จึงไม่สามารถ Reset ค่าได้");
    }

    // 3. ล้างสถานะตัวแปร Global
    currentEditingDormId = null;
    deletedImageIds = [];
    selectedFiles = []; // ล้างค่ายูสเซอร์เลือกรูปไว้ด้วย

    // 4. ล้างการพรีวิวรูปภาพ (ถ้ามี container สำหรับโชว์รูปที่เลือก)
    const previewContainer = document.getElementById('image-preview-container');
    if (previewContainer) {
        previewContainer.innerHTML = '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadMyDorms();
    loadOwnerProfile(); // สำหรับแสดงชื่อเจ้าของด้านบน
    loadStatistics(true);
    loadBookings();

    // เชื่อมต่อ WS
    initOwnerWebSocket();
});


async function loadMyDorms() {
    const container = document.getElementById('my-dorms-container');
    if (!container) return;

    container.innerHTML = `<div class="p-8 text-center text-slate-400">กำลังซิงค์ข้อมูล...</div>`;

    try {
        const response = await fetch('/api/owner/my-dorms');
        if (!response.ok) throw new Error('Failed to fetch');

        const dorms = await response.json();
        allDorms = dorms; 

        if (dorms.length === 0) {
            container.innerHTML = `
                <div class="bg-white border-2 border-dashed border-slate-100 rounded-[2.5rem] p-12 text-center">
                    <p class="text-slate-400">คุณยังไม่ได้ลงทะเบียนหอพักในระบบ</p>
                    <button onclick="openAddDormModal()" class="text-indigo-600 font-bold mt-2 hover:underline">เริ่มลงทะเบียนหอพักแรกของคุณ</button>
                </div>`;
            return;
        }

        container.innerHTML = dorms.map(dorm => {
            const isPendingUpdate = dorm.verification_status === 'pending_update';
            const isApproved = dorm.verification_status === 'approved' || dorm.is_verified;
            const isRejected = dorm.verification_status === 'rejected';
            const isPendingNew = dorm.verification_status === 'pending';

            // --- 🚨 ส่วนแก้ไข: Logic การเลือกรูปภาพเพื่อแก้ปัญหา 404 🚨 ---
            let imageUrl = 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=400';

            if (isPendingUpdate && dorm.draft) {
                // กรณีรออนุมัติการแก้ไข: เช็คว่ามีรูปใหม่ใน draft ไหม
                try {
                    const draftData = typeof dorm.draft === 'string' ? JSON.parse(dorm.draft) : dorm.draft;
                    const draftImages = typeof draftData.new_images_json === 'string' ? 
                                        JSON.parse(draftData.new_images_json) : draftData.new_images_json;

                    if (draftImages && draftImages.length > 0) {
                        // ใช้รูปแรกจาก Draft (ที่มี prefix draft_ ตาม main.py)
                        imageUrl = `/static/uploads/dorms/${draftImages[0]}`;
                    } else if (dorm.images && dorm.images.length > 0) {
                        // ถ้าไม่มีรูปใหม่ใน Draft ให้ใช้รูปเดิมที่มีอยู่แล้ว
                        imageUrl = `/static/uploads/dorms/${dorm.images[0].filename}`;
                    }
                } catch (e) { console.error("Draft image error:", e); }
            } else if (dorm.images && dorm.images.length > 0) {
                // กรณีปกติ หรือ รออนุมัติครั้งแรก: ใช้รูปจากตาราง DormImage
                imageUrl = `/static/uploads/dorms/${dorm.images[0].filename}`;
            }

            // --- ส่วนแสดงสถานะ Badge ---
            let statusBadge = '';
            let actionButtons = '';

            if (isPendingUpdate) {
                // กรณี: ขอแก้ไขข้อมูล (มีหอเดิมอยู่แล้ว แต่ส่ง Draft ใหม่ไป)
                statusBadge = `
                    <span class="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-full border border-blue-100 animate-pulse flex items-center gap-1">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        รออนุมัติการแก้ไข
                    </span>`;
                actionButtons = `<span class="text-xs text-slate-400 italic mr-2">แอดมินกำลังตรวจ...</span>`;

            } else if (isPendingNew) {
                // กรณี: ลงทะเบียนหอพักใหม่ครั้งแรก
                statusBadge = `
                    <span class="px-3 py-1 bg-amber-50 text-amber-600 text-xs font-bold rounded-full border border-amber-100 animate-pulse flex items-center gap-1">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        รออนุมัติหอใหม่
                    </span>`;
                // 🔥 เพิ่มรูปดินสอและถังขยะตรงนี้
                actionButtons = `
                    <button onclick="editDorm(${dorm.id})" class="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="แก้ไขข้อมูลที่รออนุมัติ">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button onclick="deleteDorm(${dorm.id}, true)" class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" title="ยกเลิกการลงทะเบียน">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>`;

            } else if (isApproved) {
                // กรณี: อนุมัติแล้ว (แสดงปุ่มแก้ไข/ลบปกติ)
                statusBadge = `<span class="px-3 py-1 bg-green-50 text-green-600 text-xs font-bold rounded-full border border-green-100 uppercase tracking-wider">อนุมัติแล้ว</span>`;
                actionButtons = `
                    <button onclick="editDorm(${dorm.id})" class="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button onclick="deleteDorm(${dorm.id}, true)" class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>`;

            } else if (isRejected) {
                // กรณี: ถูกปฏิเสธ (แสดง Badge แดง และเหตุผล)
                statusBadge = `<span class="px-3 py-1 bg-red-50 text-red-600 text-xs font-bold rounded-full border border-red-100 uppercase tracking-wider">ไม่ผ่านการอนุมัติ</span>`;
                actionButtons = `
                    <button onclick="editDorm(${dorm.id})" class="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2.25 2.25 0 113.182 3.182L12 10.364l-3 1 1-3 9.586-9.586z"/></svg>
                    </button>
                    
                    
                    <button onclick="deleteDorm(${dorm.id}, true)" class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" title="ลบรายการนี้">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>`;
            }

            return `
                <div class="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm flex flex-col md:flex-row gap-8 hover:shadow-md transition-all">
                    <img src="${imageUrl}" 
                        onerror="this.src='https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=400'"
                        class="w-full md:w-48 h-48 rounded-3xl object-cover shadow-inner bg-slate-100" 
                        alt="${dorm.name}">
                    
                    <div class="flex-1">
                        <div class="flex justify-between items-start">
                            ${statusBadge}
                            <div class="flex items-center gap-2">
                                ${actionButtons}
                            </div>
                        </div>

                        <h3 class="text-2xl font-bold text-slate-900 mt-2">${dorm.name}</h3>
                        
                        ${isRejected ? `
                            <div class="mt-3 p-4 bg-red-50 border border-red-100 rounded-2xl flex flex-col gap-3">
                                <div class="flex items-start gap-3">
                                    <svg class="w-5 h-5 text-red-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                                    </svg>
                                    <div>
                                        <p class="text-sm font-bold text-red-700">เหตุผลที่ไม่ผ่านการอนุมัติ:</p>
                                        <p class="text-sm text-red-600">${dorm.reject_reason || 'กรุณาตรวจสอบข้อมูลอีกครั้ง'}</p>
                                    </div>
                                </div>
                                <button onclick="editDorm(${dorm.id})" 
                                    class="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-all shadow-sm active:scale-95">
                                    แก้ไขข้อมูลและส่งให้ตรวจสอบใหม่
                                </button>
                            </div>
                        ` : ''}

                        <div class="flex items-center gap-2 text-slate-500 text-sm mt-1">
                            <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                            </svg>
                            ห่างจาก มหาวิทยาลัย ${dorm.distance_to_rmuti || '-'}
                        </div>
                        
                        <div class="grid grid-cols-2 gap-4 mt-6">
                            <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <p class="text-[10px] uppercase font-black text-slate-400 tracking-widest">สถานะห้องว่าง</p>
                                <p class="text-lg font-bold ${dorm.vacancy_count > 0 ? 'text-indigo-600' : 'text-slate-800'} mt-1">
                                    ${dorm.vacancy_count > 0 ? `ว่าง ${dorm.vacancy_count} ห้อง` : 'เต็มแล้ว'}
                                </p>
                            </div>
                            <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <p class="text-[10px] uppercase font-black text-slate-400 tracking-widest">ราคาเริ่มต้น</p>
                                <p class="text-lg font-bold text-slate-900 mt-1">฿${dorm.price_start.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = `<div class="p-8 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>`;
    }
}


// ฟังก์ชันดึงชื่อโปรไฟล์ (จาก Session) มาแสดง
async function loadOwnerProfile() {
    try {
        const response = await fetch('/api/owner/me');
        
        // 1. เช็คก่อนว่า Response OK ไหม (ถ้า 401 หรือไม่ได้ Login ให้เด้งไปหน้า login)
        if (!response.ok) {
            console.error("Unauthorized: Redirecting to login...");
            window.location.href = '/login';
            return;
        }

        const data = await response.json();
        console.log("🔍 ตรวจสอบข้อมูลจาก API /me:", data);

        // 2. ดักจับ ID ให้แม่นยำ (จาก Log ของคุณคือเลข 9)
        // ต้องเช็คว่า Backend ส่ง Key ชื่ออะไรมา (id หรือ user_id)
        myCurrentUserId = data.id || data.user_id || data.owner_id; 

        if (!myCurrentUserId) {
            console.warn("⚠️ ไม่สามารถระบุ ID ของ Owner ได้ (undefined)");
        } else {
            console.log("✅ กำหนด ID สำเร็จ:", myCurrentUserId);
        }

        // 3. นำข้อมูลไปแสดงผลในจุดต่างๆ (ใช้ ID จาก HTML ของคุณ)
        const fullName = `${data.first_name || ''} ${data.last_name || ''}`;
        
        if (document.getElementById('display-owner-name')) {
            document.getElementById('display-owner-name').innerText = fullName;
        }
        
        if (document.getElementById('display-dorm-name')) {
            document.getElementById('display-dorm-name').innerText = data.dorm_name || 'ยินดีต้อนรับ';
        }
        
        const cardDorm = document.getElementById('card-dorm-name');
        if (cardDorm) cardDorm.innerText = data.dorm_name || '-';

        // 4. เมื่อได้ข้อมูลครบแล้ว ค่อยเริ่มเชื่อมต่อ WebSocket
        if (!notificationSocket || notificationSocket.readyState !== WebSocket.OPEN) {
            console.log("🚀 กำลังเชื่อมต่อ WebSocket...");
            initOwnerWebSocket();
        }

    } catch (e) {
        console.error("❌ Profile load error:", e);
    }
}


async function editDorm(dormId) {
    try {
        // หาข้อมูลหอพักจากตัวแปร global (allDorms) ที่โหลดมาตอนแรก
        const dorm = allDorms.find(d => d.id === dormId);
        console.log("Dorm data to edit:", dorm);

        if (!dorm) {
            alert("ไม่พบข้อมูลหอพักในรายการ");
            return;
        }

        // --- 1. เคลียร์สถานะการแก้ไข ---
        currentEditingDormId = dormId;
        deletedImageIds = []; // ล้างรายการรูปที่จะลบ
        selectedFiles = [];   // ล้างไฟล์ใหม่ที่เลือกค้างไว้
        
        // เปลี่ยนหัวข้อ Modal และข้อความปุ่ม
        document.querySelector("#addDormModal h3").innerText = "แก้ไขข้อมูลหอพัก";
        const submitBtn = document.querySelector("button[onclick='submitAddDorm(event)']");
        if (submitBtn) submitBtn.innerText = "ส่งข้อมูลให้ตรวจสอบใหม่";

        // --- 2. หยอดข้อมูลลง Input (ใช้จาก dorm โดยตรง) ---
        // ใช้ || '' หรือ || 0 เพื่อป้องกันกรณีข้อมูลใน DB เป็น null แล้ว Input แสดงคำว่า undefined
        document.getElementById('dorm-name').value = dorm.name || '';
        document.getElementById('dorm-type').value = dorm.dorm_type || 'หอพักรวม';
        document.getElementById('room-type').value = dorm.room_type || '';
        document.getElementById('distance-to-rmuti').value = dorm.distance_to_rmuti || '';
        document.getElementById('vacancy-count').value = dorm.vacancy_count || 0;
        document.getElementById('price-start').value = dorm.price_start || 0;
        document.getElementById('google-map').value = dorm.google_map_link || '';
        document.getElementById('contact-number').value = dorm.contact_number || '';
        document.getElementById('line-id').value = dorm.line_id || '';
        document.getElementById('address').value = dorm.address || '';
        document.getElementById('description').value = dorm.description || '';

        // --- 3. หยอดข้อมูล Boolean (Checkbox) ---
        // ใช้ !! เพื่อแปลงค่าให้เป็น boolean (true/false) ที่แน่นอน
        document.getElementById('has-wifi').checked = !!dorm.has_wifi;
        document.getElementById('has-air').checked = !!dorm.has_air_conditioner;
        document.getElementById('has-parking').checked = !!dorm.has_parking;
        document.getElementById('has-laundry').checked = !!dorm.has_laundry;
        document.getElementById('is-pet').checked = !!dorm.is_pet_friendly;
        document.getElementById('has-keycard').checked = !!dorm.has_keycard;
        document.getElementById('has-cctv').checked = !!dorm.has_cctv;
        document.getElementById('has-security').checked = !!dorm.has_security_guard;
        document.getElementById('has-water-heater').checked = !!dorm.has_water_heater;
        document.getElementById('has-fridge').checked = !!dorm.has_refrigerator;
        document.getElementById('has-furniture').checked = !!dorm.has_furniture;
        document.getElementById('has-elevator').checked = !!dorm.has_elevator;
        document.getElementById('has-fitness').checked = !!dorm.has_fitness;
        document.getElementById('has-drinking-water').checked = !!dorm.has_drinking_water;

        // --- 4. จัดการแสดงรูปภาพเดิมที่มีอยู่ในฐานข้อมูล ---
        const previewContainer = document.getElementById('image-preview');
        previewContainer.innerHTML = ''; 

        if (dorm.images && dorm.images.length > 0) {
            dorm.images.forEach(img => {
                const div = document.createElement('div');
                div.id = `old-img-${img.id}`;
                div.className = "relative h-16 rounded-xl overflow-hidden shadow-sm border border-slate-200 group";
                div.innerHTML = `
                    <img src="/static/uploads/dorms/${img.filename}" 
                         onerror="this.src='https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=100'"
                         class="w-full h-full object-cover opacity-90">
                    <button type="button" 
                        onclick="markImageForDeletion(${img.id})" 
                        class="absolute top-0 right-0 bg-red-500 text-white rounded-bl-lg p-0.5 hover:bg-red-600 transition-colors shadow-sm">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M6 18L18 6M6 6l12 12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <div class="absolute bottom-0 left-0 right-0 bg-black/40 text-[8px] text-white text-center py-0.5">รูปเดิม</div>
                `;
                previewContainer.appendChild(div);
            });
        }

        // --- 5. แสดง Modal ---
        document.getElementById('addDormModal').classList.remove('hidden');
        // เลื่อน Modal ขึ้นไปด้านบนสุด (กรณีฟอร์มยาว)
        document.getElementById('addDormModal').scrollTo(0, 0);

    } catch (error) {
        console.error("Error in editDorm:", error);
        alert("เกิดข้อผิดพลาดในการโหลดข้อมูลเพื่อแก้ไข");
    }
}


// ฟังก์ชันเสริม: สำหรับเก็บ ID รูปเดิมที่จะสั่งลบ (เพิ่มไว้ใต้ editDorm ได้เลย)
function markImageForDeletion(imageId) {
    if (confirm("ยืนยันว่าจะลบรูปภาพเดิมนี้หรือไม่?")) {
        // เก็บ ID เข้า Array เพื่อส่งให้ Backend
        deletedImageIds.push(imageId);
        
        // ลบ UI รูปออกจากหน้าจอ
        const element = document.getElementById(`old-img-${imageId}`);
        if (element) {
            element.classList.add('scale-0', 'opacity-0');
            setTimeout(() => element.remove(), 200);
        }
    }
}

// --- ส่วนของ Real-time Update สำหรับ Owner ---

// 3. แยกฟังก์ชัน WebSocket ออกมาเพื่อให้จัดการง่าย
function initOwnerWebSocket() {
    // 1. ป้องกันการเปิด Connection ซ้อนกัน
    if (notificationSocket && notificationSocket.readyState === WebSocket.OPEN) {
        return;
    }

    const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${socketProtocol}//${window.location.host}/ws/owner/notifications`;
    
    notificationSocket = new WebSocket(socketUrl);

    notificationSocket.onmessage = function(event) {
        try {
            const response = JSON.parse(event.data);
            
            // --- Debug Log ---
            console.log("📩 WebSocket Received:", response);

            // 1. รายการ Event ที่จะให้ระบบตอบสนอง
            const updateEvents = [
                "my_dorm_added", 
                "my_dorm_deleted", 
                "dorm_verified", 
                "dorm_rejected",
                "dorm_updated_by_admin",
                "view_updated", // 🔥 เพิ่ม Event ยอดวิวตรงนี้
                "new_booking_received"
            ];

            const isTargetEvent = updateEvents.includes(response.event);
            const isMyDorm = parseInt(response.owner_id) === parseInt(myCurrentUserId);

            if (isTargetEvent && isMyDorm) {
                
                // --- 🚨 ส่วนที่เพิ่ม: จัดการ Real-time View Statistics 🚨 ---
                if (response.event === "view_updated") {
                    console.log("📈 ยอดวิวอัปเดต! กำลังดึงตัวเลขใหม่...");
                    
                    // เรียกฟังก์ชันโหลดสถิติที่เราทำไว้ (ใส่ false เพื่อไม่ให้ dropdown รีเซ็ต)
                    if (typeof loadStatistics === "function") {
                        loadStatistics(false); 
                    }
                    return; // จบการทำงานตรงนี้เลย (ยอดวิวไม่ต้องขึ้น Toast แจ้งเตือน)
                }

                // --- กรณีที่ 2: มีการจองใหม่เข้ามา (เพิ่มใหม่!) ---
                if (response.event === "new_booking_received") {
                    console.log("🔔 มีการจองใหม่! กำลังรีโหลดรายการจอง...");
                    
                    // เรียกฟังก์ชันโหลดรายการจอง (ที่ผมให้ไปในข้อที่แล้ว)
                    if (typeof loadBookings === "function") {
                        loadBookings(); 
                    }

                    // แสดง SweetAlert แจ้งเตือนสวยๆ
                    if (typeof Swal !== "undefined") {
                        Swal.fire({
                            title: 'มีการจองใหม่!',
                            text: response.data?.message || 'มีลูกค้าสนใจหอพักของคุณ',
                            icon: 'success',
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 5000,
                            timerProgressBar: true
                        });
                    }
                    return; // จบการทำงานสำหรับเคสนี้
                }

                // --------------------------------------------------

                // --- ส่วนเดิม: รีโหลดรายการหอพักหลัก ---
                console.log(`⚡ [${response.event}] กำลังรีโหลดข้อมูลหอพัก...`);
                loadMyDorms(); 

                // จัดการแสดง Toast แจ้งเตือน (เฉพาะเหตุการณ์สำคัญ)
                if (typeof showToast === "function") {
                    let toastTitle = "อัปเดตระบบ";
                    let toastType = "info";

                    if (response.event === "dorm_updated_by_admin") {
                        toastTitle = "ℹ️ ข้อมูลถูกแก้ไข";
                        toastType = "info"; 
                    } else if (response.event === "dorm_verified") {
                        toastTitle = "✅ อนุมัติสำเร็จ";
                        toastType = "success";
                    } else if (response.event === "dorm_rejected") {
                        toastTitle = "❌ ไม่ผ่านการอนุมัติ";
                        toastType = "error";
                    } else if (response.event === "my_dorm_deleted") {
                        toastTitle = "🗑️ ลบข้อมูลแล้ว";
                        toastType = "info";
                    }

                    // แสดง Toast พร้อมข้อความจาก Backend
                    showToast(toastTitle, response.data?.message || "ข้อมูลมีการเปลี่ยนแปลง", toastType);
                }
            }

        } catch (e) {
            console.error("❌ Error parsing WS message:", e);
        }
    };

    notificationSocket.onopen = function() {
        console.log("✅ Owner WebSocket Connected");
    };

    notificationSocket.onclose = function() {
        console.log("⚠️ WebSocket Closed. Reconnecting in 3s...");
        notificationSocket = null; 
        setTimeout(initOwnerWebSocket, 3000); // พยายามเชื่อมต่อใหม่
    };

    notificationSocket.onerror = function(err) {
        console.error("❌ WebSocket Error:", err);
    };
}


// --- ฟังก์ชันลบหอพัก ---
async function deleteDorm(dormId, isVerified) {
    // 1. ประกาศตัวแปรชื่อ message (หรือจะเปลี่ยนเป็น warningMessage ก็ได้ แต่ต้องใช้ชื่อเดียวกัน)
    let message = "⚠️ คุณแน่ใจหรือไม่ว่าต้องการลบหอพักนี้?\nข้อมูลทั้งหมดรวมถึงรูปภาพในเซิร์ฟเวอร์จะถูกลบออกอย่างถาวร!";
    
    // ตรวจสอบสถานะ (รองรับทั้ง boolean และ string ที่อาจหลุดมา)
    if (isVerified === true || isVerified === "true") {
        message = "🚨 หอพักนี้ได้รับอนุมัติแล้ว! การลบจะทำให้ข้อมูลหายไปจากหน้าเว็บทันทีและกู้คืนไม่ได้ \n\nกรุณายืนยันการลบอย่างถาวร:";
    }

    // 2. *** จุดสำคัญ: ต้องใช้ตัวแปรชื่อ 'message' ให้ตรงกับที่ประกาศไว้ข้างบน ***
    if (!confirm(message)) {
        return;
    }

    try {
        if (typeof showToast === "function") {
            showToast("ระบบ", "กำลังดำเนินการลบข้อมูล...");
        }

        const response = await fetch(`/api/owner/delete-dorm/${dormId}`, {
            method: 'DELETE',
        });

        if (response.ok) {
            console.log(`🗑️ หอพัก ID: ${dormId} ถูกลบเรียบร้อยแล้ว`);
            // ถ้า WebSocket ทำงาน มันจะ reload หน้าให้เอง
        } else {
            const errorData = await response.json();
            const errorMsg = errorData.detail || "เกิดข้อผิดพลาดในการลบ";
            
            if (typeof showToast === "function") {
                showToast("ข้อผิดพลาด", errorMsg);
            } else {
                alert(errorMsg);
            }
        }
    } catch (err) {
        console.error("❌ Delete API Error:", err);
        if (typeof showToast === "function") {
            showToast("ข้อผิดพลาด", "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
        }
    }
}


// --- ยอดเข้าชม ---
// --- ฟังก์ชันโหลดสถิติ (อัปเกรดจาก loadStatistics เดิม) ---
async function loadStatistics(isFirstLoad = false) {
    try {
        const response = await fetch('/api/owner/statistics');
        if (!response.ok) return;
        
        allStatsData = await response.json();

        // 🚨 เพิ่มบรรทัดนี้เพื่อเช็คข้อมูลใน Console 🚨
        console.log("📊 Stats Data Received:", allStatsData);
        
        // 1. ถ้าเป็นการโหลดครั้งแรก ให้จัดการ Dropdown
        if (isFirstLoad) {
            setupDormSelector();
        }

        // 2. อัปเดตตัวเลขบนหน้าจอตามหอพักที่เลือกอยู่ปัจจุบัน
        const currentSelector = document.getElementById('dormSelector');
        const selectedValue = currentSelector ? currentSelector.value : 'all';
        updateStatUI(selectedValue);

    } catch (error) {
        console.error('❌ Failed to load stats:', error);
    }
}

// ฟังก์ชันสร้าง/เติมข้อมูลใน Dropdown
function setupDormSelector() {
    const selector = document.getElementById('dormSelector');
    if (!selector) return;

    // ล้างค่าเดิมและเพิ่ม "หอพักทั้งหมด"
    selector.innerHTML = '<option value="all">หอพักทั้งหมด</option>';
    
    // เติมรายชื่อหอพักจากข้อมูลที่ได้จาก API
    if (allStatsData && allStatsData.dorms) {
        allStatsData.dorms.forEach(dorm => {
            const option = document.createElement('option');
            option.value = dorm.id;
            option.textContent = dorm.name;
            selector.appendChild(option);
        });
    }

    // เมื่อผู้ใช้เปลี่ยนหอพักใน Dropdown ให้เปลี่ยนตัวเลขตาม
    selector.addEventListener('change', (e) => {
        updateStatUI(e.target.value);
    });
}

// ฟังก์ชันอัปเดตตัวเลขบน Card (รองรับเอฟเฟกต์ตัวเลขวิ่ง)
function updateStatUI(dormId) {
    if (!allStatsData) return;

    let today = 0;
    let total = 0;

    // เลือกข้อมูลตาม Dropdown
    if (dormId === 'all') {
        today = allStatsData.summary.today || 0;
        total = allStatsData.summary.total || 0;
    } else {
        const selected = allStatsData.dorms.find(d => String(d.id) === String(dormId));
        if (selected) {
            today = selected.today_views;
            total = selected.total_views;
        }
    }

    console.log("🎯 Updating UI with:", today, total); 

    // ✅ เรียกใช้ฟังก์ชันตัวเลขวิ่ง โดยใช้ ID ให้ตรงกับ HTML (statToday / statTotal)
    animateNumber('statToday', today); 
    animateNumber('statTotal', total);
}


// ฟังก์ชันทำตัวเลขวิ่ง (คงไว้ตามเดิมของคุณ)
function animateNumber(id, value) {
    const obj = document.getElementById(id);
    
    // หากหา ID ไม่เจอ จะแจ้งเตือนใน Console ทันที
    if (!obj) {
        console.error(`❌ Error: ไม่พบ Element ที่มี ID: "${id}" ในหน้า HTML`);
        return;
    }
    
    let start = 0;
    const duration = 800; // ความเร็ว 0.8 วินาที
    const step = Math.ceil(value / (duration / 16));
    
    // ล้าง Interval เก่าก่อนเริ่มใหม่ (ป้องกันเลขตีกันเวลาคนกด Dropdown รัวๆ)
    if (obj._timer) clearInterval(obj._timer);

    obj._timer = setInterval(() => {
        start += step;
        if (start >= value) {
            obj.textContent = value.toLocaleString();
            clearInterval(obj._timer);
        } else {
            obj.textContent = start.toLocaleString();
        }
    }, 16);
}


// 1. ฟังก์ชันดึงข้อมูลการจองจาก API
async function loadBookings() {
    try {
        const response = await fetch('/api/owner/bookings');
        if (!response.ok) throw new Error('ดึงข้อมูลการจองล้มเหลว');
        const bookings = await response.json();
        renderBookings(bookings);
    } catch (error) {
        console.error("Booking Load Error:", error);
    }
}

// 2. ฟังก์ชันแสดงผลข้อมูลลง HTML
function renderBookings(bookings) {
    const container = document.getElementById('booking-list-container');
    const badge = document.getElementById('booking-count-badge');
    
    if (bookings.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                <p class="text-slate-400 font-bold text-lg font-sans">ไม่มีรายการจองในขณะนี้</p>
            </div>`;
        badge.innerText = '0 รายการ';
        return;
    }

    badge.innerText = `${bookings.length} รายการ`;
    
    container.innerHTML = bookings.map(b => {
        const statusConfig = getStatusConfig(b.status);
        const isPending = b.status === 'pending';

        return `
        <div class="group bg-white p-7 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-500 flex flex-col h-full">
            <div class="relative flex-1"> <div class="flex justify-between items-start mb-6">
                    <div>
                        <span class="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase mb-2 inline-block">
                            #BK-${b.id.toString().padStart(4, '0')}
                        </span>
                        <h5 class="font-extrabold text-xl text-slate-900 leading-tight">${b.guest_name}</h5>
                        <p class="text-xs text-indigo-500 font-bold mt-1 uppercase tracking-wider">${b.dorm_name}</p>
                    </div>
                    <span class="px-3 py-1.5 ${statusConfig.class} rounded-xl text-[10px] font-black uppercase border ${statusConfig.border}">
                        ${statusConfig.label}
                    </span>
                </div>

                <div class="space-y-3 mb-8">
                    <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100/50">
                        <span class="text-lg">📞</span>
                        <div>
                            <p class="text-[9px] font-black text-slate-400 uppercase leading-none mb-1">เบอร์โทรศัพท์</p>
                            <p class="text-sm font-bold text-slate-700">${b.guest_phone}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100/50">
                        <span class="text-lg">📅</span>
                        <div>
                            <p class="text-[9px] font-black text-slate-400 uppercase leading-none mb-1">วันที่เข้าพัก</p>
                            <p class="text-sm font-bold text-slate-700 font-sans">${new Date(b.check_in_date).toLocaleDateString('th-TH', { dateStyle: 'long' })}</p>
                        </div>
                    </div>
                    
                    <div class="min-h-[60px] flex items-center">
                        ${b.remark ? `
                        <div class="w-full p-3 bg-amber-50/50 rounded-2xl border border-amber-100/50">
                            <p class="text-xs text-amber-700 font-medium leading-relaxed italic">"${b.remark}"</p>
                        </div>` : `<p class="text-[10px] text-slate-300 italic px-3">ไม่มีหมายเหตุเพิ่มเติม</p>`}
                    </div>
                </div>
            </div>

            <div class="flex gap-3 mt-auto pt-4 border-t border-slate-50">
                ${isPending ? `
                    <button onclick="updateBookingStatus(${b.id}, 'confirmed')" class="flex-[2] bg-slate-900 text-white py-4 rounded-2xl text-xs font-bold hover:bg-indigo-600 transition-all active:scale-95 shadow-lg shadow-slate-200">
                        ยืนยันการจอง
                    </button>
                    <button onclick="updateBookingStatus(${b.id}, 'cancelled')" class="flex-1 bg-rose-50 text-rose-600 py-4 rounded-2xl text-xs font-bold hover:bg-rose-100 transition-all active:scale-95">
                        ยกเลิก
                    </button>
                ` : `
                    <button disabled class="w-full bg-slate-100 text-slate-400 py-4 rounded-2xl text-xs font-bold opacity-60">
                        ดำเนินการเสร็จสิ้น
                    </button>
                `}
            </div>
        </div>
        `;
    }).join('');
}


// ฟังก์ชันเสริมสำหรับเปลี่ยนสี Badge ตามสถานะ (ช่วยให้ดูง่ายขึ้นเยอะครับ)
function getStatusConfig(status) {
    switch (status) {
        case 'confirmed':
            return { 
                label: '✅ ยืนยันแล้ว', 
                class: 'bg-emerald-50 text-emerald-600', 
                border: 'border-emerald-100' 
            };
        case 'cancelled':
            return { 
                label: '❌ ยกเลิกแล้ว', 
                class: 'bg-rose-50 text-rose-600', 
                border: 'border-rose-100' 
            };
        default:
            return { 
                label: '⏳ รอการยืนยัน', 
                class: 'bg-amber-50 text-amber-600', 
                border: 'border-amber-100' 
            };
    }
}


// ปุ่ม "ยืนยัน" และ "ยกเลิก" คำขอจอง
async function updateBookingStatus(bookingId, newStatus) {
    const confirmText = newStatus === 'confirmed' 
        ? 'ยืนยันการจอง? (ระบบจะลดจำนวนห้องว่างลง 1 ห้อง)' 
        : 'ยกเลิกการจอง?';
        
    if (!confirm(confirmText)) return;

    try {
        const response = await fetch(`/api/owner/bookings/${bookingId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });

        if (response.ok) {
            Swal.fire('สำเร็จ', 'อัปเดตสถานะการจองเรียบร้อยแล้ว', 'success');
            
            // 1. โหลดรายการจองใหม่
            loadBookings(); 
            
            // 2. โหลดรายการหอพักใหม่ (เพื่ออัปเดตตัวเลข vacancy_count บนหน้าจอ)
            if (typeof loadMyDorms === "function") {
                loadMyDorms(); 
            }
        } else {
            const err = await response.json();
            alert(err.detail || "ไม่สามารถดำเนินการได้");
        }
    } catch (error) {
        console.error("Update Error:", error);
    }
}