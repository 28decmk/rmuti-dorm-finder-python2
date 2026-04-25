let currentDormImages = []; // เก็บ URL รูปภาพทั้งหมดของหอพักที่เปิดอยู่
let currentImageIndex = 0; // เก็บว่าตอนนี้ดูรูปที่เท่าไหร่


const currentVisitorId = getOrCreateVisitorId();
console.log("Current Visitor ID:", currentVisitorId);

// --- ส่วนที่เพิ่มใหม่: ระบบ Login ---
document.getElementById('loginForm').addEventListener('submit', async(e) => {
    e.preventDefault();

    const identity = document.getElementById('login_identity').value;
    const password = document.getElementById('login_password').value;
    const btn = document.getElementById('loginSubmitBtn');
    const btnText = document.getElementById('loginBtnText');
    const spinner = document.getElementById('loginSpinner');

    // แสดงสถานะการโหลด
    btn.disabled = true;
    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                identity: identity,
                password: password
            })
        });

        const data = await response.json();

        if (response.ok) {
            // 1. เก็บเฉพาะ Role ลง LocalStorage (เพราะ Role ไม่ใช่ข้อมูลลับ เอาไว้ใช้ทำ UI)
            localStorage.setItem('user_role', data.role);

            // 2. แสดงแจ้งเตือน
            alert('ยินดีต้อนรับ! เข้าสู่ระบบในฐานะ ' + data.role);

            // 3. ปิด Modal และ Redirect
            toggleModal();

            let targetUrl = data.role === 'admin' ? '/admin/dashboard' : '/owner/dashboard';

            // ใช้ replace แทน href เพื่อไม่ให้หน้า Login ค้างอยู่ใน History stack
            window.location.replace(targetUrl);
        } else {
            // --- ส่วนที่ปรับปรุงใหม่ ---
            if (response.status === 403) {
                // กรณีโดนดัก is_approved = False
                alert('🚫 เข้าสู่ระบบไม่ได้: ' + data.detail);
            } else if (response.status === 401) {
                // กรณีรหัสผิด หรือไม่พบ User
                alert('🔑 ' + data.detail);
            } else {
                alert('❌ เกิดข้อผิดพลาด: ' + (data.detail || 'กรุณาลองใหม่ภายหลัง'));
            }
        }
    } catch (error) {
        console.error('Login Error:', error);
        alert('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
        // คืนค่าปุ่ม
        btn.disabled = false;
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
    }
});

// --- ระบบลงทะเบียนเจ้าของหอพัก (Owner Register) ---
document.getElementById('registerForm').addEventListener('submit', async(e) => {
    e.preventDefault();

    // ดึงค่าจาก ID ที่เราตั้งไว้ใน Modal ลงทะเบียน
    const payload = {
        username: document.getElementById('reg_username').value,
        email: document.getElementById('reg_email').value,
        first_name: document.getElementById('reg_firstname').value,
        last_name: document.getElementById('reg_lastname').value,
        phone: document.getElementById('reg_phone').value,
        dorm_name: document.getElementById('reg_dormname').value, // <--- เพิ่มบรรทัดนี้!
        password: document.getElementById('reg_password').value
    };

    try {
        const response = await fetch('/api/auth/register-owner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            // สมัครสำเร็จ
            alert('ลงทะเบียนสำเร็จ! กรุณารอผู้ดูแลระบบอนุมัติบัญชีของคุณ');
            toggleRegisterModal(); // ปิด Modal ลงทะเบียน
            switchToLogin(); // สลับไปหน้า Login เพื่อให้เขารอเข้าสู่ระบบ
        } else {
            // ถ้าเป็น Error 422 หรืออื่นๆ จะได้เห็นข้อความจาก Server
            alert('⚠️ ไม่สามารถลงทะเบียนได้: ' + (result.detail || 'ข้อมูลไม่ถูกต้อง'));
        }
    } catch (error) {
        console.error('Register Error:', error);
        alert('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    }
});



// ฟังก์ชันสำหรับโหลดหอพักแนะนำมาแสดงที่หน้าแรก
async function fetchRecommendedDorms(targetUrl = '/api/public/dorms') {
    const container = document.getElementById('dorm-list-container');

    // แสดงสถานะกำลังโหลด
    container.innerHTML = `
        <div class="col-span-full text-center py-20">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent"></div>
            <p class="mt-4 text-slate-500 font-medium">กำลังค้นหาหอพักที่ดีที่สุดสำหรับคุณ...</p>
        </div>`;

    try {
        // ใช้ targetUrl ที่ส่งมา (ถ้าไม่มีจะเป็นหน้าแรก + ป้องกัน Cache ด้วย TimeStamp)
        const finalUrl = targetUrl.includes('?') ?
            `${targetUrl}&t=${new Date().getTime()}` :
            `${targetUrl}?t=${new Date().getTime()}`;

        const response = await fetch(finalUrl);
        if (!response.ok) throw new Error('ไม่สามารถดึงข้อมูลได้');

        const dorms = await response.json();

        // กรณีไม่มีข้อมูล
        if (!dorms || dorms.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-20 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
                    <div class="mb-4 flex justify-center">
                        <svg class="w-16 h-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                    </div>
                    <p class="text-slate-500 text-lg font-medium">ไม่พบข้อมูลหอพักที่คุณต้องการ</p>
                    <button onclick="location.reload()" class="mt-4 text-indigo-600 underline">ดูหอพักทั้งหมด</button>
                </div>`;
            return;
        }

        container.innerHTML = ''; // ล้าง Loading

        // --- ใช้ Logic วาดเดิมของคุณเป๊ะๆ ---
        dorms.forEach(dorm => {
            const imageUrl = (dorm.images && dorm.images.length > 0) ?
                `/static/uploads/dorms/${dorm.images[0].filename}` :
                'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=800';

            const vacancyBadge = dorm.vacancy_count > 0 ?
                `<span class="bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-emerald-600 shadow-sm border border-emerald-100">ว่าง ${dorm.vacancy_count} ห้อง</span>` :
                `<span class="bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm">เต็มแล้ว</span>`;

            const viewCountHTML = `
                <div class="flex items-center gap-1.5 text-slate-400 text-xs font-medium bg-slate-50 px-2.5 py-1 rounded-lg">
                    <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span id="view-count-index-${dorm.id}">${(dorm.total_views || 0).toLocaleString()}</span> ครั้ง
                </div>`;

            const cardHTML = `
                <div class="group bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-500 overflow-hidden hover:-translate-y-2">
                    <div class="relative overflow-hidden h-64">
                        <img class="h-full w-full object-cover transform group-hover:scale-110 transition-transform duration-700" 
                             src="${imageUrl}" alt="${dorm.name}" onerror="this.src='https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=800'">
                        <div class="absolute top-4 left-4">${vacancyBadge}</div>
                    </div>
                    <div class="p-8">
                        <div class="flex justify-between items-start mb-4">
                            <span class="text-slate-500 text-xs font-bold uppercase tracking-[0.1em]">${dorm.dorm_type || 'หอพัก'}</span>
                            ${viewCountHTML}
                        </div>
                        <h3 class="font-bold text-2xl text-slate-900 group-hover:text-indigo-600 transition-colors mb-2 truncate">${dorm.name}</h3>
                        <div class="flex items-center gap-2 text-slate-500 text-sm mb-6">
                            <i class="fa-solid fa-location-dot text-indigo-500"></i> ห่างจาก มทร.อีสาน ${dorm.distance_to_rmuti || '-'}
                        </div>
                        <div class="pt-6 border-t border-slate-50 flex justify-between items-center">
                            <div>
                                <p class="text-[10px] text-slate-400 font-black mb-0.5">เริ่มต้นที่</p>
                                <span class="text-2xl font-black text-slate-900">฿${dorm.price_start.toLocaleString()}<span class="text-sm font-normal text-slate-400">/เดือน</span></span>
                            </div>
                            <button onclick="viewDormDetail(${dorm.id})" class="h-12 px-6 rounded-2xl bg-indigo-50 text-indigo-600 font-bold hover:bg-indigo-600 hover:text-white transition-all">รายละเอียด</button>
                        </div>
                    </div>
                </div>`;
            container.insertAdjacentHTML('beforeend', cardHTML);
        });

    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = `<div class="col-span-full text-center py-20 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>`;
    }
}

// ฟังก์ชันสำหรับเปิดดูรายละเอียด
function viewDormDetail(dormId) {
    // ในอนาคตคุณจะสร้างหน้า dorm_detail.html?id=...
    window.location.href = `/dormitory/${dormId}`;
}


// ดูรายละเอียดหอพัก 
async function viewDormDetail(dormId) {
    // --- 1. สั่งนับยอดวิวทันทีที่กดดู ---
    try {
        await trackDormView(dormId);
    } catch (e) {
        console.error("Tracking failed:", e);
    }

    try {
        const response = await fetch(`/api/public/dorms/${dormId}`);
        if (!response.ok) throw new Error('Dorm not found');
        const dorm = await response.json();

        // --- เตรียมข้อมูลรูปภาพสำหรับ Lightbox ---
        currentDormImages = dorm.images.map(img => `/static/uploads/dorms/${img.filename}`);
        if (currentDormImages.length === 0) {
            currentDormImages = ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=800'];
        }

        const modal = document.getElementById('publicDormModal');
        const content = document.getElementById('publicDormContent');
        const formattedPhone = dorm.contact_number.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');

        // จัดการเลขยอดวิวล่าสุด
        const latestViewsFormatted = (dorm.total_views || 0).toLocaleString();

        // --- ปรับปรุงส่วนจัดการรูปภาพ (Showcase Grid) ---
        let imageGridHTML = `
            <div class="grid grid-cols-4 grid-rows-2 gap-3 h-[450px] rounded-[2.5rem] overflow-hidden mb-8 shadow-2xl shadow-indigo-100/20">
                <div class="col-span-2 row-span-2 overflow-hidden cursor-pointer group" onclick="openLightbox(0)">
                    <img src="${currentDormImages[0]}" class="w-full h-full object-cover group-hover:scale-110 transition duration-700">
                </div>
                
                ${currentDormImages.slice(1, 5).map((src, idx) => `
                    <div class="col-span-1 overflow-hidden cursor-pointer group relative" onclick="openLightbox(${idx + 1})">
                        <img src="${src}" class="w-full h-full object-cover group-hover:scale-110 transition duration-700">
                        ${idx === 3 && currentDormImages.length > 5 ? `
                            <div class="absolute inset-0 bg-black/40 flex items-center justify-center text-white font-bold text-xl group-hover:bg-black/20 transition-all">
                                +${currentDormImages.length - 5} รูป
                            </div>
                        ` : ''}
                    </div>
                `).join('')}

                ${currentDormImages.length < 5 ? `
                    <div class="col-span-1 bg-slate-50 flex items-center justify-center text-slate-300">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    </div>
                `.repeat(5 - currentDormImages.length) : ''}
            </div>
        `;

        const amenities = [
            { key: 'has_wifi', label: 'Wi-Fi', icon: '📶' },
            { key: 'has_air_conditioner', label: 'แอร์', icon: '❄️' },
            { key: 'has_parking', label: 'ที่จอดรถ', icon: '🚗' },
            { key: 'has_laundry', label: 'เครื่องซักผ้า', icon: '🧺' },
            { key: 'is_pet_friendly', label: 'สัตว์เลี้ยง', icon: '🐾' },
            { key: 'has_water_heater', label: 'เครื่องทำน้ำอุ่น', icon: '🚿' },
            { key: 'has_elevator', label: 'ลิฟต์', icon: '🛗' },
            { key: 'has_furniture', label: 'เฟอร์นิเจอร์', icon: '🛏️' },
            { key: 'has_refrigerator', label: 'ตู้เย็น', icon: '🧊' },
            { key: 'has_keycard', label: 'คีย์การ์ด', icon: '🔑' },
            { key: 'has_cctv', label: 'กล้องวงจรปิด', icon: '📹' },
            { key: 'has_security_guard', label: 'รปภ.', icon: '👮' },
            { key: 'has_fitness', label: 'ฟิตเนส', icon: '🏋️' },
            { key: 'has_drinking_water', label: 'ตู้น้ำดื่ม', icon: '💧' }
        ];

        const amenitiesHTML = amenities
            .filter(a => dorm[a.key])
            .map(a => `<div class="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                <span class="text-2xl">${a.icon}</span>
                <span class="font-bold text-slate-700">${a.label}</span>
            </div>`).join('');

        // พ่นเนื้อหาลงไปใน Modal
        content.innerHTML = `
            ${imageGridHTML}
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div class="lg:col-span-2">
                    <div class="flex justify-between items-start mb-6">
                        <div>
                            <h2 class="text-4xl font-black text-slate-900 mb-2">${dorm.name}</h2>
                            <p class="text-slate-500 flex items-center gap-2">
                                <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
                                ${dorm.address}
                            </p>
                        </div>
                        <div class="text-right">
                            <span class="bg-indigo-600 text-white px-5 py-2 rounded-full font-bold text-sm shadow-lg shadow-indigo-100">${dorm.dorm_type}</span>
                        </div>
                    </div>

                    <div class="grid grid-cols-3 gap-4 mb-8">
                        <div class="p-4 bg-indigo-50 rounded-[1.5rem] border border-indigo-100/50">
                            <p class="text-[10px] text-indigo-400 font-black uppercase tracking-widest mb-1">ระยะทาง</p>
                            <p class="text-lg font-black text-indigo-700">มทร. ${dorm.distance_to_rmuti}</p>
                        </div>

                        <div class="p-4 bg-purple-50 rounded-[1.5rem] border border-purple-100/50">
                            <p class="text-[10px] text-purple-400 font-black uppercase tracking-widest mb-1">ประเภทห้อง</p>
                            <p class="text-lg font-black text-purple-700">${dorm.room_type || 'ไม่ระบุ'}</p>
                        </div>

                        <div class="p-4 bg-emerald-50 rounded-[1.5rem] border border-emerald-100/50">
                            <p class="text-[10px] text-emerald-400 font-black uppercase tracking-widest mb-1">สถานะ</p>
                            <p class="text-lg font-black text-emerald-700">${dorm.vacancy_count > 0 ? `ว่าง ${dorm.vacancy_count} ห้อง` : 'เต็มแล้ว'}</p>
                        </div>
                        <div class="p-4 bg-slate-50 rounded-[1.5rem] border border-slate-100/50">
                            <p class="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">ยอดเข้าชม</p>
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                <p class="text-lg font-black text-slate-700">
                                    <span id="view-count-modal-${dorm.id}">${latestViewsFormatted}</span> ครั้ง
                                </p>
                            </div>
                        </div>
                    </div>

                    <h3 class="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <span class="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                        รายละเอียดเพิ่มเติม
                    </h3>
                    <p class="text-slate-600 leading-relaxed mb-8 text-lg">${dorm.description || 'ไม่มีข้อมูลรายละเอียด'}</p>

                    <h3 class="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <span class="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                        สิ่งอำนวยความสะดวก
                    </h3>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
                        ${amenitiesHTML || '<p class="text-slate-400 italic">ไม่มีข้อมูล</p>'}
                    </div>
                </div>

                <div class="lg:col-span-1">
                    <div class="sticky top-8 bg-white border border-slate-100 p-8 rounded-[2.5rem] shadow-2xl shadow-slate-200/40">
                        <p class="text-slate-400 font-black mb-1 uppercase text-[10px] tracking-[0.2em]">ราคาเริ่มต้น</p>
                        <div class="flex items-baseline gap-1 mb-8">
                            <span class="text-5xl font-black text-slate-900">฿${dorm.price_start.toLocaleString()}</span>
                            <span class="text-slate-400 font-medium">/เดือน</span>
                        </div>
                        <div class="space-y-4">

                            <button onclick="openBookingModal(${dorm.id})" 
                                class="flex items-center justify-center gap-3 w-full bg-[#FF6600] text-white py-4 rounded-2xl font-black text-xl hover:bg-[#e65c00] transition-all shadow-xl shadow-orange-100 active:scale-95 mb-6 ring-4 ring-orange-50">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                จองหอพักที่นี่
                            </button>


                            <a href="tel:${dorm.contact_number}" class="flex items-center justify-center gap-3 w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
                                </svg>
                                โทร: ${formattedPhone}
                            </a>
                            ${dorm.line_id ? `
                                <a href="https://line.me/ti/p/${dorm.line_id.startsWith('@') ? dorm.line_id : '~' + dorm.line_id}" 
                                target="_blank" 
                                class="flex items-center justify-center gap-3 w-full bg-[#06C755] text-white py-4 rounded-2xl font-bold hover:opacity-90 transition-all shadow-lg shadow-green-100 active:scale-95">
                                    <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.036 9.608.391.084.922.258 1.057.592.121.303.079.778.039 1.085l-.171 1.027c-.052.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.438-6.967 1.739-1.907 2.561-3.943 2.561-5.992z"/></svg>
                                    สอบถามทาง Line
                                </a>
                            ` : ''}

                            ${dorm.google_map_link ? `
                                <a href="${dorm.google_map_link}" target="_blank" 
                                class="flex items-center justify-center gap-3 w-full bg-white border-2 border-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-50 hover:border-slate-200 transition-all active:scale-95">
                                    <svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"></path>
                                    </svg>
                                    ดูตำแหน่งบนแผนที่
                                </a>
                            ` : `
                                <div class="flex items-center justify-center gap-3 w-full bg-slate-50 text-slate-400 py-4 rounded-2xl font-bold border border-dashed border-slate-200 cursor-not-allowed">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L16 4m0 13V4m0 0L9 7"></path>
                                    </svg>
                                    ไม่มีข้อมูลแผนที่
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // --- ✅ ส่วนสำคัญ: อัปเดตเลขที่หน้าแรก (Index) ทันทีที่โหลดข้อมูลเสร็จ ---
        const indexViewSpan = document.getElementById(`view-count-index-${dormId}`);
        if (indexViewSpan) {
            indexViewSpan.innerText = latestViewsFormatted;
        }

        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

    } catch (error) {
        console.error(error);
        alert('ไม่สามารถโหลดข้อมูลหอพักได้ กรุณาลองใหม่');
    }
}

function openLightbox(index) {
    currentImageIndex = index;
    updateLightboxContent();
    document.getElementById('lightboxModal').classList.remove('hidden');
}

function closeLightbox() {
    document.getElementById('lightboxModal').classList.add('hidden');
}

function updateLightboxContent() {
    const imgElement = document.getElementById('lightboxImg');
    const captionElement = document.getElementById('lightboxCaption');
    
    // อัปเดตรูปและข้อความ
    imgElement.src = currentDormImages[currentImageIndex];
    captionElement.innerText = `${currentImageIndex + 1} / ${currentDormImages.length}`;
}

function nextImage() {
    currentImageIndex = (currentImageIndex + 1) % currentDormImages.length;
    updateLightboxContent();
}

function prevImage() {
    currentImageIndex = (currentImageIndex - 1 + currentDormImages.length) % currentDormImages.length;
    updateLightboxContent();
}

// เพิ่มลูกเล่น: กดปุ่มลูกศรที่ Keyboard เพื่อเปลี่ยนรูปได้
document.addEventListener('keydown', (e) => {
    const lightbox = document.getElementById('lightboxModal');
    if (lightbox.classList.contains('hidden')) return;

    if (e.key === 'ArrowRight') nextImage();
    if (e.key === 'ArrowLeft') prevImage();
    if (e.key === 'Escape') closeLightbox();
});

function closePublicModal() {
    document.getElementById('publicDormModal').classList.add('hidden');
    document.body.style.overflow = 'auto';
}


// ฟังก์ชันสร้าง/ดึง Visitor ID จากเครื่องผู้ใช้
function getOrCreateVisitorId() {
    let visitorId = localStorage.getItem('dorm_visitor_id');
    if (!visitorId) {
        // สร้าง ID สุ่มแบบง่าย: v-ตามด้วยสุ่มตัวอักษรและเวลา
        visitorId = 'v-' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
        localStorage.setItem('dorm_visitor_id', visitorId);
    }
    return visitorId;
}


async function trackDormView(dormId) {
    const visitorId = getOrCreateVisitorId();
    const viewedKey = `viewed_dorm_${dormId}`;
    if (sessionStorage.getItem(viewedKey)) return;

    try {
        // แก้ไขบรรทัดนี้: ตรวจสอบ path ให้ตรงกับ FastAPI 
        // ถ้าคุณเอาไปรวมกับกลุ่ม public ต้องใส่ /api/public/...
        const response = await fetch(`/api/public/dorms/${dormId}/view`, { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ visitor_id: visitorId })
        });

        if (response.ok) {
            sessionStorage.setItem(viewedKey, 'true');
            console.log(`✅ View tracked for dorm: ${dormId}`);
        } else {
            // ดูว่ามันฟ้อง error อะไร
            console.error(`❌ Track failed: ${response.status}`);
        }
    } catch (error) {
        console.error('❌ Error tracking view:', error);
    }
}



// ฟังก์ชันค้นหา 
async function handleSearch() {
    const query = document.getElementById('search-input').value.trim();
    
    if (query.length < 2) {
        alert("กรุณาพิมพ์อย่างน้อย 2 ตัวอักษร");
        return;
    }

    // --- แก้ไขตรงนี้ ---
    // เปลี่ยนจาก /api/public/search?q= เป็น /api/public/dorms?search=
    // เพื่อให้มันวิ่งไปหาฟังก์ชันใหม่ใน Backend ที่เราเพิ่งเขียน ซึ่งรองรับทั้ง Search และ Sort/Filter ในตัวเดียว
    const searchUrl = `/api/public/dorms?search=${encodeURIComponent(query)}`;
    
    // เรียกใช้ฟังก์ชันเดิมที่วาด Card สวยๆ ให้เราเหมือนเดิม
    fetchRecommendedDorms(searchUrl); 

    // (Optional) เลื่อนหน้าจอลงมาที่รายการหอพักเพื่อให้ผู้ใช้เห็นผลลัพธ์ทันที
    document.getElementById('dorm-list-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
}


// ฟังก์ชัน เปิด/ปิด แผงตัวกรอง
function toggleFilterSection() {
    const section = document.getElementById('filter-section');
    section.classList.toggle('hidden');
}


// ฟังก์ชันเปลี่ยนตัวเลขที่แสดงบนหน้าจอ
function updateDistanceDisplay(val) {
    const display = document.getElementById('distance-display');
    if (val >= 5000) {
        display.innerText = "ทั้งหมด";
    } else if (val >= 1000) {
        display.innerText = (val / 1000).toFixed(1) + " กม.";
    } else {
        display.innerText = val + " เมตร";
    }
}


// ฟังก์ชัน รวบรวมค่าจาก Filter ทั้งหมดแล้วส่งไป API
async function applyFilters() {
    const sort = document.getElementById('filter-sort').value;
    const type = document.getElementById('filter-type').value;
    const search = document.getElementById('search-input').value.trim();
    // ดึงค่าระยะทางจาก Slider
    const distance = document.getElementById('filter-distance').value;
    
    const amenities = Array.from(document.querySelectorAll('input[name="amenity"]:checked'))
        .map(cb => cb.value)
        .join(',');

    let params = new URLSearchParams();
    params.append('t', Date.now()); 

    if (search) params.append('search', search);
    if (sort && sort !== 'latest') params.append('sort', sort);
    if (type && type !== 'all') params.append('dorm_type', type);
    if (amenities) params.append('amenities', amenities);
    
    // เพิ่มการส่งค่า max_distance ไปที่ API (ถ้าไม่ใช่ค่าสูงสุด 5000)
    if (distance < 5000) {
        params.append('max_distance', distance);
    }

    const url = `/api/public/dorms?${params.toString()}`;
    
    const container = document.getElementById('dorm-container');
    if (container) container.style.opacity = '0.5';

    if (typeof fetchRecommendedDorms === 'function') {
        await fetchRecommendedDorms(url);
    }

    if (container) container.style.opacity = '1';
}


function resetDormList() {
    // 1. ล้างค่าในช่อง Input
    document.getElementById('search-input').value = '';
    
    // 2. (ถ้ามีตัวกรองอื่นๆ เช่น Select หรือ Checkbox) ให้รีเซ็ตค่าด้วย
    const sortSelect = document.getElementById('filter-sort');
    if (sortSelect) sortSelect.value = 'latest';
    
    document.querySelectorAll('input[name="amenity"]').forEach(cb => cb.checked = false);

    // 3. เรียกโหลดข้อมูลใหม่แบบ "ไร้ตัวแปร" (จะกลับไปเป็นหน้าแรกปกติ)
    fetchRecommendedDorms(); 
}

// แนะนำให้เพิ่ม Event พิมพ์แล้วกด Enter ได้เลย
document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});



// ฟังก์ชันเปิด Modal จอง
function openBookingModal(dormId) {
    // 1. ดึงชื่อหอพักเก็บไว้ก่อน
    const dormNameElement = document.querySelector('#publicDormContent h2');
    const dormName = dormNameElement ? dormNameElement.innerText : "หอพัก";
    
    // 2. ปิด Modal รายละเอียดหอพักก่อน (เพื่อไม่ให้มันซ้อนกัน)
    const publicModal = document.getElementById('publicDormModal');
    if (publicModal) {
        publicModal.classList.add('hidden');
    }

    // 3. ใส่ข้อมูลใน Booking Modal
    document.getElementById('booking-dorm-id').value = dormId;
    document.getElementById('booking-dorm-name').innerText = dormName;
    
    // 4. แสดง Booking Modal
    const bookingModal = document.getElementById('bookingModal');
    bookingModal.classList.remove('hidden');
    bookingModal.classList.add('flex');
    
    // ป้องกันการ Scroll (ถ้ายังไม่ได้ทำ)
    document.body.style.overflow = 'hidden';
}

// ฟังก์ชันปิด Modal จอง
function closeBookingModal() {
    const bookingModal = document.getElementById('bookingModal');
    bookingModal.classList.add('hidden');
    bookingModal.classList.remove('flex');

    // เมื่อปิดหน้าจอง "ควรเปิดหน้ารายละเอียดหอพักกลับคืนมา" (ย้อนกลับ)
    const publicModal = document.getElementById('publicDormModal');
    if (publicModal) {
        publicModal.classList.remove('hidden');
    }
}

// จัดการการส่งฟอร์ม (Submit)
document.getElementById('bookingForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btn = e.target.querySelector('button[type="submit"]');
    const dormId = document.getElementById('booking-dorm-id').value;
    
    // ดึงค่าจาก input ต่างๆ
    const formData = {
        dorm_id: parseInt(dormId),
        guest_name: e.target.querySelector('input[type="text"]').value,
        guest_phone: e.target.querySelector('input[type="tel"]').value,
        check_in_date: e.target.querySelector('input[type="date"]').value,
        remark: e.target.querySelector('textarea').value
    };

    try {
        btn.innerText = "กำลังส่งข้อมูล...";
        btn.disabled = true;

        const response = await fetch('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            Swal.fire({ // ใช้ SweetAlert2 จะสวยกว่า alert ธรรมดา
                icon: 'success',
                title: 'จองหอพักสำเร็จ!',
                text: 'เจ้าของหอพักจะติดต่อกลับหาคุณโดยเร็วที่สุด',
                confirmButtonColor: '#003399'
            });
            closeBookingModal();
            e.target.reset(); // ล้างข้อมูลในฟอร์ม
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'เกิดข้อผิดพลาดในการจอง');
        }
    } catch (error) {
        alert("❌ Error: " + error.message);
    } finally {
        btn.innerHTML = `ส่งข้อมูลการจอง <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`;
        btn.disabled = false;
    }
});




// เริ่มต้นทำงาน
document.addEventListener('DOMContentLoaded', () => {
    fetchRecommendedDorms();
    getOrCreateVisitorId();
});