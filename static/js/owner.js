let selectedRoomFiles = [];      // เก็บไฟล์ภาพใหม่ที่จะอัปโหลด
let deletedRoomImageIds = [];    // เก็บ ID รูปภาพเดิมที่จะลบ
let currentEditingRoomId = null;
let currentEditingDormId = null;

let selectedFiles = []; // ตัวแปรเก็บไฟล์รูปภาพ
// ตัวแปรเก็บ ID หอพักที่กำลังแก้ไข (null หมายถึงกำลังเพิ่มใหม่)
// เพิ่มตัวแปรไว้ด้านบนสุดของไฟล์ owner.js เพื่อเก็บข้อมูลหอพักทั้งหมด
let allDorms = [];

let deletedImageIds = []; // เก็บ ID รูปที่จะลบ

// เพิ่มตัวแปรไว้ด้านบนสุดของไฟล์ owner.js
let myCurrentUserId = null;

let notificationSocket = null;

let allStatsData = null; // เก็บข้อมูลทั้งหมดไว้ที่นี่

let currentRoomTypeImages = [];


let roomViewImageList = [];
let currentRoomImgIndex = 0;




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


// ฟังก์ชันเปิด Modal และโหลดข้อมูลหอพักที่มีอยู่
function openAddRoomTypeModal() {
    const modal = document.getElementById('roomTypeModal');
    const dormSelect = document.getElementById('room-type-dorm-select');
    
    // เติมข้อมูลใน Select จากหอพักที่ 'approved' เท่านั้น (ตัวแปร allDorms ที่คุณมีอยู่แล้ว)
    const approvedDorms = allDorms.filter(d => d.verification_status === 'approved' || d.is_verified);
    
    dormSelect.innerHTML = approvedDorms.map(d => 
        `<option value="${d.id}">${d.name}</option>`
    ).join('');

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // ป้องกันการสกอลหน้าเว็บด้านหลัง
}

function closeRoomTypeModal() {
    document.getElementById('roomTypeModal').classList.add('hidden');
    document.body.style.overflow = 'auto';
}

// ฟังก์ชันเพิ่มแถวกรอกข้อมูลใหม่
function addNewRoomRow() {
    const container = document.getElementById('room-rows-container');
    const roomId = Date.now(); 
    const newRow = document.createElement('div');
    
    newRow.className = 'bg-slate-50 rounded-[2rem] p-6 border border-slate-100 mb-6 animate-fade-in relative group';
    newRow.innerHTML = `
        <button onclick="this.parentElement.remove()" class="absolute -top-2 -right-2 w-8 h-8 bg-white text-red-500 shadow-sm border border-red-100 rounded-full hover:bg-red-50 transition-all flex items-center justify-center z-10">
            <i class="fas fa-times"></i>
        </button>

        <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div class="md:col-span-4 space-y-4">
                <div class="relative group/img">
                    <label class="text-[10px] font-black uppercase text-slate-400 ml-1 mb-1 block">รูปถ่ายประเภทห้อง (สูงสุด 5 รูป)</label>
                    
                    <div onclick="document.getElementById('img-${roomId}').click()" 
                         class="min-h-[120px] bg-white border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 transition-all p-4">
                        
                        <input type="file" id="img-${roomId}" class="hidden" accept="image/*" multiple onchange="previewMultipleRoomImages(this, '${roomId}')">
                        
                        <div id="preview-container-${roomId}" class="grid grid-cols-3 gap-2 w-full">
                            <div id="placeholder-${roomId}" class="col-span-3 text-center py-4">
                                <i class="fas fa-images text-2xl text-slate-300 mb-1"></i>
                                <p class="text-[9px] font-bold text-slate-400 uppercase">คลิกเพื่อเพิ่มรูปภาพ (1-5 รูป)</p>
                            </div>
                        </div>
                    </div>
                    <p class="text-[8px] text-slate-400 mt-2 ml-1 italic">* กด Ctrl หรือ Shift ค้างเพื่อเลือกหลายรูป</p>
                </div>
                
                <div>
                    <label class="text-[10px] font-black uppercase text-slate-400 ml-1 mb-1 block">คำอธิบายห้องพัก</label>
                    <textarea name="room_description" rows="2" placeholder="เช่น วิวสระว่ายน้ำ, เฟอร์นิเจอร์ไม้..." 
                              class="w-full px-4 py-3 bg-white rounded-xl border-none text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"></textarea>
                </div>
            </div>

            <div class="md:col-span-8">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <div class="md:col-span-1">
                        <label class="text-[10px] font-black uppercase text-slate-400 ml-1">ชื่อประเภทห้อง</label>
                        <input type="text" name="room_name" placeholder="ห้องแอร์ เตียงคู่" 
                               class="w-full px-4 py-3 rounded-xl border-none bg-white text-sm font-bold focus:ring-2 focus:ring-indigo-500/20">
                    </div>
                    <div>
                        <label class="text-[10px] font-black uppercase text-slate-400 ml-1">ราคา (บาท/เดือน)</label>
                        <input type="number" name="room_price" placeholder="4500" 
                               class="w-full px-4 py-3 rounded-xl border-none bg-white text-sm font-bold focus:ring-2 focus:ring-indigo-500/20">
                    </div>
                    <div>
                        <label class="text-[10px] font-black uppercase text-slate-400 ml-1">ห้องว่าง</label>
                        <input type="number" name="room_vacancy" placeholder="2" 
                               class="w-full px-4 py-3 rounded-xl border-none bg-white text-sm font-bold focus:ring-2 focus:ring-indigo-500/20">
                    </div>
                </div>

                <label class="text-[10px] font-black uppercase text-slate-400 ml-1 mb-2 block">สิ่งอำนวยความสะดวกในห้อง</label>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                    ${['แอร์', 'พัดลม', 'ตู้เย็น', 'ทีวี', 'เครื่องทำน้ำอุ่น', 'ระเบียง', 'อ่างล้างจาน', 'ไมโครเวฟ'].map(item => `
                        <label class="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100 cursor-pointer hover:bg-indigo-50/50 transition-all">
                            <input type="checkbox" name="room_amenities_${roomId}" value="${item}" class="w-3 h-3 accent-indigo-600">
                            <span class="text-[10px] font-bold text-slate-600">${item}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    container.appendChild(newRow);
}


function previewMultipleRoomImages(input, roomId) {
    const container = document.getElementById(`preview-container-${roomId}`);
    const placeholder = document.getElementById(`placeholder-${roomId}`);
    
    // ตรวจสอบว่าเลือกเกิน 5 รูปไหม
    if (input.files.length > 5) {
        alert("เลือกได้สูงสุด 5 รูปต่อห้องครับ");
        input.value = ""; // ล้างค่า
        container.innerHTML = '';
        container.appendChild(placeholder);
        placeholder.classList.remove('hidden');
        return;
    }

    // ล้าง Preview เก่า
    container.innerHTML = '';
    
    if (input.files && input.files.length > 0) {
        placeholder.classList.add('hidden');
        
        Array.from(input.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const imgDiv = document.createElement('div');
                imgDiv.className = "aspect-square rounded-lg overflow-hidden border border-slate-200 shadow-sm";
                imgDiv.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`;
                container.appendChild(imgDiv);
            }
            reader.readAsDataURL(file);
        });
    } else {
        container.appendChild(placeholder);
        placeholder.classList.remove('hidden');
    }
}


async function saveRoomTypes() {
    const dormId = document.getElementById('room-type-dorm-select').value;
    const container = document.getElementById('room-rows-container');
    const rows = container.querySelectorAll('.bg-slate-50');
    
    const formData = new FormData();
    const roomTypes = [];

    rows.forEach((row, index) => {
        const roomId = row.querySelector('input[type="file"]').id.replace('img-', '');
        const amenities = Array.from(row.querySelectorAll(`input[name="room_amenities_${roomId}"]:checked`)).map(el => el.value);

        // 1. เก็บข้อมูล Text
        roomTypes.push({
            name: row.querySelector('input[name="room_name"]').value,
            price: parseInt(row.querySelector('input[name="room_price"]').value) || 0,
            vacancy_count: parseInt(row.querySelector('input[name="room_vacancy"]').value) || 0,
            description: row.querySelector('textarea[name="room_description"]').value,
            has_air_conditioner: amenities.includes('แอร์'),
            has_fan: amenities.includes('พัดลม'),
            has_refrigerator: amenities.includes('ตู้เย็น'),
            has_tv: amenities.includes('ทีวี'),
            has_water_heater: amenities.includes('เครื่องทำน้ำอุ่น'),
            has_balcony: amenities.includes('ระเบียง'),
            has_kitchen_sink: amenities.includes('อ่างล้างจาน'),
            has_microwave: amenities.includes('ไมโครเวฟ')
        });

        // 2. ดึงไฟล์รูปภาพ (รองรับหลายไฟล์)
        const fileInput = document.getElementById(`img-${roomId}`);
        if (fileInput.files.length > 0) {
            // วนลูปไฟล์ที่เลือก (จำกัดสูงสุด 5 รูป)
            Array.from(fileInput.files).forEach((file, fileIndex) => {
                if (fileIndex < 5) {
                    // 🚨 หัวใจสำคัญ: ตั้งชื่อไฟล์ใหม่เพื่อให้ Backend รู้ว่ารูปนี้เป็นของห้องที่ index เท่าไหร่
                    const renamedFile = new File([file], `room_${index}_${file.name}`, { type: file.type });
                    formData.append('room_images', renamedFile);
                }
            });
        }
    });

    // 3. แนบ JSON string
    formData.append('room_types_json', JSON.stringify(roomTypes));

    try {
        const response = await fetch(`/api/owner/dorms/${dormId}/room-types`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            alert("บันทึกข้อมูลประเภทห้องและรูปภาพเรียบร้อยแล้ว!"); 
            closeRoomTypeModal();
            location.reload();
        } else {
            const err = await response.json();
            alert("เกิดข้อผิดพลาด: " + err.detail);
        }
    } catch (error) {
        console.error("Error:", error);
        alert("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    }
}

// ฟังก์ชันสำหรับพรีวิวรูปภาพของแต่ละแถว
function previewRoomImage(input, roomId) {
    const previewCtx = document.getElementById(`preview-ctx-${roomId}`);
    const imgView = document.getElementById(`view-${roomId}`);
    
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imgView.src = e.target.result;
            imgView.classList.remove('hidden');
            previewCtx.classList.add('hidden');
        }
        reader.readAsDataURL(input.files[0]);
    }
}


async function openRoomTypeView(roomTypeId, dormId) {
    try {
        // ✅ 0. เก็บ ID ไว้ใช้ตอนกดปุ่มดินสอ
        currentEditingRoomId = roomTypeId;
        currentEditingDormId = dormId;

        // ดึงข้อมูลประเภทห้องจาก API
        const response = await fetch(`/api/owner/dorms/${dormId}/room-types`);
        const roomTypes = await response.json();
        
        // ค้นหาห้องที่กดดูจาก ID
        const type = roomTypes.find(rt => rt.id === roomTypeId);
        if (!type) return;

        // 1. แสดงรูปภาพ
        const imgContainer = document.getElementById('room-view-images');
        if (type.room_images && type.room_images.length > 0) {
            imgContainer.innerHTML = type.room_images.map(img => `
                <div class="w-full h-full flex-shrink-0 snap-center">
                    <img src="/static/uploads/dorms/${img.filename}" class="w-full h-full object-cover">
                </div>
            `).join('');
        } else {
            imgContainer.innerHTML = `
                <div class="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400">
                    <div class="text-center">
                        <i class="fas fa-image text-3xl mb-2 opacity-20"></i>
                        <p class="text-xs font-bold">ไม่มีรูปภาพประกอบ</p>
                    </div>
                </div>`;
        }

        // 2. ข้อมูลพื้นฐาน
        document.getElementById('room-view-name').innerText = type.name;
        document.getElementById('room-view-price').innerText = `฿${type.price.toLocaleString()} / เดือน`;
        document.getElementById('room-view-description').innerText = type.description || 'ไม่มีรายละเอียดเพิ่มเติมสำหรับประเภทห้องนี้';
        
        const vacancyEl = document.getElementById('room-view-vacancy');
        if (type.vacancy_count > 0) {
            vacancyEl.className = "px-4 py-2 rounded-2xl font-bold text-xs bg-green-50 text-green-600 border border-green-100";
            vacancyEl.innerHTML = `<i class="fas fa-check-circle mr-1"></i> ว่าง ${type.vacancy_count} ห้อง`;
        } else {
            vacancyEl.className = "px-4 py-2 rounded-2xl font-bold text-xs bg-red-50 text-red-400 border border-red-100";
            vacancyEl.innerHTML = `<i class="fas fa-times-circle mr-1"></i> ห้องเต็ม`;
        }

        // 3. สิ่งอำนวยความสะดวก
        const amenitiesList = {
            has_air_conditioner: 'แอร์',
            has_fan: 'พัดลม',
            has_refrigerator: 'ตู้เย็น',
            has_tv: 'ทีวี',
            has_water_heater: 'น้ำอุ่น',
            has_balcony: 'ระเบียง',
            has_kitchen_sink: 'ซิงค์ล้างจาน',
            has_microwave: 'ไมโครเวฟ'
        };

        const amenContainer = document.getElementById('room-view-amenities');
        amenContainer.innerHTML = Object.keys(amenitiesList).map(key => {
            const hasItem = type[key];
            return `
                <div class="flex items-center gap-2 ${hasItem ? 'text-slate-700' : 'text-slate-300'}">
                    <div class="w-6 h-6 flex items-center justify-center rounded-lg ${hasItem ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-50'}">
                        <i class="fas ${hasItem ? 'fa-check text-[10px]' : 'fa-circle text-[6px] opacity-20'}"></i>
                    </div>
                    <span class="text-[13px] font-bold">${amenitiesList[key]}</span>
                </div>
            `;
        }).join('');

        // เปิด Modal
        document.getElementById('roomTypeViewModal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';

    } catch (error) {
        console.error("Error:", error);
        alert("ไม่สามารถเปิดดูข้อมูลได้");
    }
}


function handleEditFromView() {
    if (!currentEditingRoomId || !currentEditingDormId) return;

    // 1. ปิด Modal ดูรายละเอียดก่อน
    closeRoomTypeViewModal();

    // 2. เรียกฟังก์ชันเปิดหน้าแก้ไขประเภทห้องของคุณ (ใส่ชื่อฟังก์ชันแก้ไขจริงของคุณที่นี่)
    // ตัวอย่างเช่น: openEditRoomType(currentEditingRoomId, currentEditingDormId);
    if (typeof openEditRoomType === "function") {
        openEditRoomType(currentEditingRoomId, currentEditingDormId);
    } else {
        alert("ระบบกำลังเตรียมหน้าแก้ไข... (เชื่อมต่อฟังก์ชัน openEditRoomType)");
    }
}


async function openEditRoomType(roomTypeId, dormId) {
    try {
        const response = await fetch(`/api/owner/dorms/${dormId}/room-types`);
        if (!response.ok) throw new Error("ไม่สามารถดึงข้อมูลห้องพักได้");
        
        const roomTypes = await response.json();
        const type = roomTypes.find(rt => rt.id === roomTypeId);
        
        if (!type) {
            alert("ไม่พบข้อมูลประเภทห้องพัก");
            return;
        }

        currentEditingRoomId = roomTypeId;
        currentEditingDormId = dormId;
        selectedRoomFiles = []; 
        deletedRoomImageIds = [];
        
        const previewContainer = document.getElementById('new-room-images-preview');
        if (previewContainer) previewContainer.innerHTML = '';

        // --- 3. นำข้อมูลใส่ Form (ปรับปรุงให้ปลอดภัย) ---
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
            else console.warn(`⚠️ หา ID '${id}' ไม่พบใน HTML`);
        };

        setVal('edit-room-name', type.name);
        setVal('edit-room-price', type.price);
        setVal('edit-room-vacancy', type.vacancy_count);
        setVal('edit-room-description', type.description || '');

        // --- 4. จัดการ Amenities (ปรับปรุงให้ปลอดภัย) ---
        const amenities = [
            'has_air_conditioner', 'has_fan', 'has_refrigerator', 'has_tv',
            'has_water_heater', 'has_balcony', 'has_kitchen_sink', 'has_microwave'
        ];
        amenities.forEach(key => {
            const id = `edit-${key.replace(/_/g, '-')}`;
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.checked = type[key] || false;
            } else {
                console.warn(`⚠️ หา Checkbox ID '${id}' ไม่พบใน HTML`);
            }
        });

        renderExistingRoomImages(type.room_images || []);

        const modal = document.getElementById('editRoomTypeModal');
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

    } catch (error) {
        console.error("Error Details:", error); // ดู Error เต็มๆ ใน Console
        alert("เกิดข้อผิดพลาด: " + error.message);
    }
}


function handleRoomFileSelect(event) {
    const files = Array.from(event.target.files);
    const previewContainer = document.getElementById('new-room-images-preview');

    files.forEach(file => {
        selectedRoomFiles.push(file);
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = "relative w-20 h-20 animate-in zoom-in";
            div.innerHTML = `
                <img src="${e.target.result}" class="w-full h-full object-cover rounded-2xl shadow-sm border-2 border-indigo-500">
                <button type="button" onclick="removeSelectedRoomFile(this, ${selectedRoomFiles.length - 1})" 
                    class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-[10px] shadow-md">
                    <i class="fas fa-times"></i>
                </button>
            `;
            previewContainer.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

// ฟังก์ชันลบรูปที่เพิ่งเลือก (ก่อนกดยืนยัน)
function removeSelectedRoomFile(element, index) {
    selectedRoomFiles.splice(index, 1);
    element.parentElement.remove();
}


// แสดงรูปเดิมที่มีอยู่ในฐานข้อมูล
function renderExistingRoomImages(images) {
    const container = document.getElementById('edit-room-images-container');
    if (!container) return;

    container.innerHTML = images.map(img => `
        <div class="relative w-20 h-20 group" id="old-room-img-${img.id}">
            <img src="/static/uploads/dorms/${img.filename}?t=${new Date().getTime()}" 
                 class="w-full h-full object-cover rounded-2xl border border-slate-200">
            
            <button type="button" onclick="markRoomImageForDeletion(${img.id})" 
                class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-[10px] shadow-md hover:bg-red-600 transition-colors">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}


// เมื่อกดลบรูปเดิม
function markRoomImageForDeletion(imageId) {
    if (!deletedRoomImageIds.includes(imageId)) {
        deletedRoomImageIds.push(imageId);
    }
    const el = document.getElementById(`old-room-img-${imageId}`);
    if (el) el.classList.add('hidden'); // ซ่อนรูปออกจาก UI
}


async function submitEditRoomType(event) {
    event.preventDefault();
    
    // 1. ดึง Element มาเช็คก่อนว่ามีอยู่จริงไหม
    const elName = document.getElementById('edit-room-name');
    const elPrice = document.getElementById('edit-room-price');
    const elVacancy = document.getElementById('edit-room-vacancy');
    const elDesc = document.getElementById('edit-room-description');

    if (!elName) {
        alert("หาช่องกรอกชื่อไม่เจอในระบบ (ID: edit-room-name)");
        return;
    }

    const submitBtn = event.target.querySelector("button[type='submit']");
    const originalText = submitBtn.innerHTML;
    
    const formData = new FormData();
    
    // 2. Append ข้อมูลพื้นฐาน
    formData.append('name', elName.value); 
    formData.append('price', parseInt(elPrice.value) || 0);
    formData.append('vacancy_count', parseInt(elVacancy.value) || 0);
    formData.append('description', elDesc ? elDesc.value : "");

    // --- Amenities ---
    const amenities = ['has_air_conditioner', 'has_fan', 'has_refrigerator', 'has_tv', 'has_water_heater', 'has_balcony', 'has_kitchen_sink', 'has_microwave'];
    amenities.forEach(key => {
        const id = `edit-${key.replace(/_/g, '-')}`;
        const cb = document.getElementById(id);
        formData.append(key, cb ? cb.checked : false);
    });

    // --- Images (ปรับปรุง: ตัด window. ออกเพื่อใช้ตัวแปร Global) ---
    if (selectedRoomFiles && selectedRoomFiles.length > 0) {
        selectedRoomFiles.forEach(file => {
            formData.append('images', file);
        });
    }
    
    // --- Delete Images (ปรับปรุง: ตัด window. ออก) ---
    formData.append('delete_image_ids', JSON.stringify(deletedRoomImageIds || []));

    // ******************************************
    // 🚀 ส่วน DEBUG UPLOAD (เอาไว้เช็คก่อนส่ง)
    // ******************************************
    console.log("--- DEBUG UPLOAD ---");
    console.log("Current ID:", currentEditingRoomId);
    console.log("Files in Array:", selectedRoomFiles.length);
    for (let pair of formData.entries()) {
        console.log(pair[0] + ': ', pair[1]);
    }
    // ******************************************

    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = "กำลังบันทึก...";

        const response = await fetch(`/api/owner/update-room-type/${currentEditingRoomId}`, {
            method: 'PUT',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            alert("อัปเดตข้อมูลเรียบร้อย"); 
            
            // ✅ ล้างค่าทุกอย่างหลังจากสำเร็จ
            selectedRoomFiles = []; 
            deletedRoomImageIds = [];
            const previewContainer = document.getElementById('new-room-images-preview');
            if (previewContainer) previewContainer.innerHTML = ''; 
            
            closeEditRoomTypeModal();
            await loadMyDorms(); // รีโหลดหน้าจอหลัก
        } else {
            console.error("Detail:", result.detail);
            alert("บันทึกไม่สำเร็จ: " + (result.detail[0]?.msg || "ข้อมูลไม่ครบถ้วน"));
        }
    } catch (error) {
        console.error("Error:", error);
        alert("เกิดข้อผิดพลาดในการอัปเดต");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}


function closeRoomTypeViewModal() {
    document.getElementById('roomTypeViewModal').classList.add('hidden');
    document.body.style.overflow = 'auto';
}

function closeEditRoomTypeModal() {
    const modal = document.getElementById('editRoomTypeModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    document.body.style.overflow = 'auto'; // คืนค่าการเลื่อนหน้าจอ
    
    // Cleanup State
    selectedRoomFiles = [];
    deletedRoomImageIds = [];
    currentEditingRoomId = null;
    
    const previewContainer = document.getElementById('new-room-images-preview');
    if (previewContainer) previewContainer.innerHTML = '';
}


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

            // --- Logic การเลือกรูปภาพหอพัก ---
            let imageUrl = 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=400';
            if (isPendingUpdate && dorm.draft) {
                try {
                    const draftData = typeof dorm.draft === 'string' ? JSON.parse(dorm.draft) : dorm.draft;
                    const draftImages = typeof draftData.new_images_json === 'string' ? JSON.parse(draftData.new_images_json) : draftData.new_images_json;
                    if (draftImages && draftImages.length > 0) imageUrl = `/static/uploads/dorms/${draftImages[0]}`;
                    else if (dorm.images && dorm.images.length > 0) imageUrl = `/static/uploads/dorms/${dorm.images[0].filename}`;
                } catch (e) { console.error("Draft image error:", e); }
            } else if (dorm.images && dorm.images.length > 0) {
                imageUrl = `/static/uploads/dorms/${dorm.images[0].filename}`;
            }

            // --- ส่วนแสดงสถานะ Badge & Action Buttons ---
            let statusBadge = '';
            let actionButtons = '';

            if (isPendingUpdate) {
                statusBadge = `<span class="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-full border border-blue-100 animate-pulse flex items-center gap-1">รออนุมัติการแก้ไข</span>`;
                actionButtons = `<span class="text-xs text-slate-400 italic mr-2">แอดมินกำลังตรวจ...</span>`;
            } else if (isPendingNew) {
                statusBadge = `<span class="px-3 py-1 bg-amber-50 text-amber-600 text-xs font-bold rounded-full border border-amber-100 animate-pulse">รออนุมัติหอใหม่</span>`;
                actionButtons = `<button onclick="editDorm(${dorm.id})" class="p-2 text-slate-400 hover:text-indigo-600 rounded-xl"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>`;
            } else if (isApproved) {
                statusBadge = `<span class="px-3 py-1 bg-green-50 text-green-600 text-xs font-bold rounded-full border border-green-100">อนุมัติแล้ว</span>`;
                actionButtons = `<button onclick="editDorm(${dorm.id})" class="p-2 text-slate-400 hover:text-indigo-600 rounded-xl"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>`;
            } else if (isRejected) {
                statusBadge = `<span class="px-3 py-1 bg-red-50 text-red-600 text-xs font-bold rounded-full border border-red-100">ไม่ผ่านการอนุมัติ</span>`;
            }

            return `
                <div class="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm flex flex-col md:flex-row gap-8 hover:shadow-md transition-all mb-6">
                    <img src="${imageUrl}" onerror="this.src='https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=400'"
                         class="w-full md:w-48 h-48 rounded-3xl object-cover shadow-inner bg-slate-100">
                    
                    <div class="flex-1">
                        <div class="flex justify-between items-start">
                            ${statusBadge}
                            <div class="flex items-center gap-2">${actionButtons}</div>
                        </div>

                        <h3 class="text-2xl font-bold text-slate-900 mt-2">${dorm.name}</h3>
                        
                        <div class="mt-4" id="room-types-display-${dorm.id}">
                            <div class="animate-pulse flex gap-2">
                                <div class="h-6 w-20 bg-slate-100 rounded-full"></div>
                                <div class="h-6 w-20 bg-slate-100 rounded-full"></div>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4 mt-6">
                            <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <p class="text-[10px] uppercase font-black text-slate-400 tracking-widest">สถานะห้องว่างรวม</p>
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

        // --- 🚨 สั่งโหลดประเภทห้องพักของทุกหอพักที่แสดง ---
        dorms.forEach(dorm => {
            fetchRoomTypesForDorm(dorm.id);
        });

        // ตรวจสอบปุ่ม "จัดการประเภทห้องพัก" ด้านบน
        const hasApprovedDorm = dorms.some(dorm => dorm.verification_status === 'approved' || dorm.is_verified === true);
        const manageBtn = document.getElementById('btn-manage-room-types');
        if (manageBtn) {
            if (hasApprovedDorm) { manageBtn.classList.remove('hidden'); manageBtn.classList.add('flex'); }
            else { manageBtn.classList.add('hidden'); }
        }

    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = `<div class="p-8 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>`;
    }
}


// api ดึงประเภทห้องพักมาแสดง 
async function fetchRoomTypesForDorm(dormId) {
    const displayContainer = document.getElementById(`room-types-display-${dormId}`);
    if (!displayContainer) return;

    try {
        const response = await fetch(`/api/owner/dorms/${dormId}/room-types`);
        if (!response.ok) throw new Error('Failed to fetch room types');
        
        const roomTypes = await response.json();

        if (!roomTypes || roomTypes.length === 0) {
            displayContainer.innerHTML = `<p class="text-[10px] text-slate-400 bg-slate-50 w-fit px-3 py-1 rounded-full">ยังไม่มีข้อมูลประเภทห้องพัก</p>`;
            return;
        }

        displayContainer.innerHTML = `
            <div class="flex flex-col gap-3">
                <p class="text-[11px] font-bold text-slate-500 uppercase tracking-tight">ประเภทห้องพักที่เปิดบริการ:</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    ${roomTypes.map(type => {
                        // ✅ แก้ไขจุดนี้: เติม ?t=... เพื่อให้ Browser โหลดรูปใหม่เสมอหลังจากแก้ไข
                        const roomImg = (type.room_images && type.room_images.length > 0)
                            ? `/static/uploads/dorms/${type.room_images[0].filename}?t=${new Date().getTime()}`
                            : 'https://images.unsplash.com/photo-1522770179533-24471fcdba45?w=200';

                        return `
                        <div onclick="openRoomTypeView(${type.id}, ${dormId})" 
                            class="relative flex items-center gap-3 p-2 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer group">
                            
                            <button type="button" 
                                    onclick="event.stopPropagation(); openEditRoomType(${type.id}, ${dormId})" 
                                    class="absolute -top-1 -right-1 bg-amber-500 text-white rounded-full p-1.5 hover:bg-amber-600 transition-colors shadow-sm opacity-0 group-hover:opacity-100 z-10">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </button>

                            <img src="${roomImg}" class="w-10 h-10 rounded-xl object-cover bg-slate-50 group-hover:scale-105 transition-transform">
                            
                            <div class="min-w-0 flex-1">
                                <h4 class="text-[12px] font-bold text-slate-800 truncate group-hover:text-indigo-600 pr-4">${type.name}</h4>
                                <div class="flex items-center gap-2">
                                    <span class="text-[11px] font-bold text-indigo-600">฿${type.price.toLocaleString()}</span>
                                    <span class="text-[10px] ${type.vacancy_count > 0 ? 'text-green-500' : 'text-red-400'}">
                                        ● ${type.vacancy_count > 0 ? `ว่าง ${type.vacancy_count}` : 'เต็ม'}
                                    </span>
                                </div>
                            </div>

                            <i class="fas fa-chevron-right text-[10px] text-slate-300 group-hover:text-indigo-400 mr-1"></i>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

    } catch (error) {
        console.error(`Error loading room types for dorm ${dormId}:`, error);
        displayContainer.innerHTML = `<p class="text-[10px] text-red-400">โหลดข้อมูลห้องพักไม่สำเร็จ</p>`;
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
            <div class="relative flex-1"> 
                <div class="flex justify-between items-start mb-6">
                    <div>
                        <span class="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase mb-2 inline-block">
                            #BK-${b.id.toString().padStart(4, '0')}
                        </span>
                        <h5 class="font-extrabold text-xl text-slate-900 leading-tight">${b.guest_name}</h5>
                        
                        <div class="flex flex-wrap items-center gap-2 mt-1">
                            <p class="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">${b.dorm_name}</p>
                            <span class="text-[10px] text-slate-300">|</span>
                            <p class="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">ประเภท: ${b.room_type_name}</p>
                        </div>
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
    let confirmText = '';
    if (newStatus === 'confirmed') {
        confirmText = 'ยืนยันการจองนี้?';
    } else if (newStatus === 'cancelled' || newStatus === 'rejected') {
        confirmText = 'ยกเลิกการจอง? (ระบบจะคืนจำนวนห้องว่างกลับไป 1 ห้อง)';
    }
        
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