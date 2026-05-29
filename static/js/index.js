let currentDormImages = []; // เก็บ URL รูปภาพทั้งหมดของหอพักที่เปิดอยู่
let currentImageIndex = 0; // เก็บว่าตอนนี้ดูรูปที่เท่าไหร่
let currentDormData = null;
let currentRoomTypes = [];
let currentRoomImages = []; // เก็บ Array รูปภาพของห้องที่กำลังดู
let currentRoomImgIdx = 0; // เก็บ Index รูปที่กำลังแสดง
let currentSelectedRoomTypeId = null; // ตัวแปรเก็บไว้ว่ากำลังจองห้องไหน
let currentLightboxIndex = 0;

let isChatOpen = false;
let currentActiveDormId = null; // เก็บไว้ว่าตอนนี้กำลังคุยกับหอไหน


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
            localStorage.setItem('user_role', data.role);

            // ✅ เปลี่ยนจาก alert เป็น SweetAlert2 สวยๆ
            Swal.fire({
                title: 'เข้าสู่ระบบสำเร็จ!',
                text: `ยินดีต้อนรับคุณเข้าสู่ระบบในฐานะ ${data.role === 'admin' ? 'ผู้ดูแลระบบ' : 'เจ้าของหอพัก'}`,
                icon: 'success',
                timer: 2000, // แสดง 2 วินาทีแล้วปิดเอง
                showConfirmButton: false,
                background: '#ffffff',
                borderRadius: '2rem',
                customClass: {
                    title: 'font-black text-slate-900',
                    popup: 'rounded-[2rem]'
                }
            }).then(() => {
                // พอกดปิด หรือหมดเวลา 2 วิ ถึงจะทำการ Redirect
                toggleModal();
                let targetUrl = data.role === 'admin' ? '/admin/dashboard' : '/owner/dashboard';
                window.location.replace(targetUrl);
            });

        } else {
            // ✅ ส่วนของการแจ้งเตือนเมื่อเกิดข้อผิดพลาด
            let errorTitle = 'เข้าสู่ระบบไม่สำเร็จ';
            let errorIcon = 'error';

            if (response.status === 403) {
                errorTitle = 'รอการอนุมัติ';
                errorIcon = 'warning';
            }

            Swal.fire({
                title: errorTitle,
                text: data.detail || 'กรุณาลองใหม่ภายหลัง',
                icon: errorIcon,
                confirmButtonText: 'ตกลง',
                confirmButtonColor: '#000000',
                background: '#ffffff',
                customClass: {
                    popup: 'rounded-[2rem]',
                    confirmButton: 'rounded-xl px-8 py-3'
                }
            });
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
            // ✅ เปลี่ยนเป็น Pop-up สวยงามสำหรับการสมัครสมาชิก
            Swal.fire({
                title: 'ลงทะเบียนสำเร็จ!',
                text: 'บัญชีของคุณถูกสร้างแล้ว กรุณารอผู้ดูแลระบบตรวจสอบและอนุมัติภายใน 24 ชม.',
                icon: 'success',
                confirmButtonText: 'รับทราบ',
                confirmButtonColor: '#000000',
                background: '#ffffff',
                customClass: {
                    title: 'font-black text-slate-900',
                    popup: 'rounded-[2.5rem]',
                    confirmButton: 'rounded-2xl px-10 py-4 font-bold text-lg'
                }
            }).then(() => {
                // หลังจากกด "รับทราบ" ถึงจะสลับหน้า
                toggleRegisterModal(); 
                switchToLogin(); 
            });

        } else {
            // ⚠️ กรณีเกิดข้อผิดพลาด เช่น Email ซ้ำ หรือข้อมูลไม่ครบ
            Swal.fire({
                title: 'ลงทะเบียนไม่สำเร็จ',
                text: data.detail || 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
                icon: 'warning',
                confirmButtonText: 'กลับไปแก้ไข',
                confirmButtonColor: '#FF6600', // ใช้สีส้มเพื่อให้สะดุดตา
                background: '#ffffff',
                customClass: {
                    popup: 'rounded-[2.5rem]',
                    confirmButton: 'rounded-2xl px-8 py-3 font-bold'
                }
            });
        }
    } catch (error) {
        console.error('Register Error:', error);
        Swal.fire({
            title: 'การเชื่อมต่อขัดข้อง',
            text: 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง',
            icon: 'error',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#ef4444',
            customClass: {
                popup: 'rounded-[2.5rem]'
            }
        });
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

        // --- ส่วน UI ใหม่ในฟังก์ชัน fetchRecommendedDorms ---

        dorms.forEach(dorm => {
            const imageUrl = (dorm.images && dorm.images.length > 0) ?
                `/static/uploads/dorms/${dorm.images[0].filename}` :
                'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=800';

            // 1. ปรับ Badge สถานะให้ดูทันสมัยขึ้น (สีเขียว Agoda)
            const vacancyBadge = dorm.vacancy_count > 0 ?
                `<span class="bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-emerald-600 shadow-sm border border-emerald-100">ว่าง ${dorm.vacancy_count} ห้อง</span>` :
                `<span class="bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm">เต็มแล้ว</span>`;

            // 2. ปรับตัวเลขยอดเข้าชม
            const viewCountHTML = `
                <div class="flex items-center gap-1 text-slate-400 text-[11px] font-bold">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    <span>${(dorm.total_views || 0).toLocaleString()}</span>
                </div>`;

            const cardHTML = `
                <div class="group bg-white rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-[0_20px_50px_rgba(0,51,153,0.1)] transition-all duration-500 overflow-hidden hover:-translate-y-2 flex flex-col h-full">
                    <div class="relative overflow-hidden h-60">
                        <img class="h-full w-full object-cover transform group-hover:scale-110 transition-transform duration-700" 
                            src="${imageUrl}" alt="${dorm.name}" onerror="this.src='https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=800'">
                        <div class="absolute top-4 left-4 z-10">${vacancyBadge}</div>
                        <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>

                    <div class="p-6 flex flex-col flex-1">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-[#003399] text-[10px] font-black uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded-md">${dorm.dorm_type || 'หอพัก'}</span>
                            ${viewCountHTML}
                        </div>

                        <h3 class="font-bold text-xl text-slate-800 group-hover:text-[#003399] transition-colors mb-2 line-clamp-1">${dorm.name}</h3>
                        
                        <div class="flex items-center gap-1.5 text-slate-500 text-sm mb-auto">
                            <svg class="w-4 h-4 text-rose-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" /></svg>
                            <span class="font-medium">มทร.อีสาน <span class="text-slate-400 font-normal">(${dorm.distance_to_rmuti || '-'})</span></span>
                        </div>

                        <div class="mt-6 pt-4 border-t border-slate-50 flex justify-between items-end">
                            <div>
                                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-tight">ราคาเริ่มต้น</p>
                                <div class="flex items-baseline gap-1">
                                    <span class="text-2xl font-black text-emerald-600">฿${dorm.price_start.toLocaleString()}</span>
                                    <span class="text-xs font-bold text-slate-400">/เดือน</span>
                                </div>
                            </div>
                            <button onclick="viewDormDetail(${dorm.id})" 
                                    class="bg-[#003399] text-white px-5 py-3 rounded-xl font-bold text-sm hover:bg-blue-800 shadow-lg shadow-blue-900/10 active:scale-95 transition-all">
                                จองเลย
                            </button>
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

        // ✅ เก็บข้อมูล Room Types ไว้ที่ตัวแปร Global เพื่อใช้ใน Modal ถัดไป
        currentRoomTypes = dorm.room_types || [];

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
            .filter(a => dorm[a.key] === true || dorm[a.key] === 1) // เพิ่มการเช็คเลข 1 เผื่อไว้
            .map(a => `
                <div class="flex items-center gap-3 text-slate-700">
                    <div class="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                        <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <span class="text-sm font-medium text-slate-600">${a.label}</span>
                </div>
            `).join('');

        // พ่นเนื้อหาลงไปใน Modal สไตล์ Agoda
        content.innerHTML = `
            <div class="mb-8 -mx-8 md:-mx-12 -mt-8 md:-mt-12 overflow-hidden border-b border-slate-100">
                ${imageGridHTML}
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div class="lg:col-span-2">
                    <div class="mb-8">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="flex text-yellow-400">
                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                            </span>
                            <span class="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-tighter">ยอดนิยมในย่านนี้</span>
                        </div>
                        <h2 class="text-3xl font-bold text-slate-900 mb-2">${dorm.name}</h2>
                        <p class="text-blue-600 font-medium flex items-center gap-1 text-sm underline cursor-pointer">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
                            ${dorm.address} - <span class="text-slate-500 no-underline">ห่างจาก มทร. ${dorm.distance_to_rmuti}</span>
                        </p>
                    </div>

                    <div class="flex flex-wrap gap-2 mb-8">
                        <span class="bg-slate-100 text-slate-700 px-3 py-1 rounded-md text-sm font-medium border border-slate-200">ประเภท: ${dorm.dorm_type}</span>
                        <span class="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-md text-sm font-medium border border-emerald-100">${dorm.vacancy_count > 0 ? `ว่าง ${dorm.vacancy_count} ห้อง` : 'เต็มแล้ว'}</span>
                        <span class="bg-blue-50 text-blue-700 px-3 py-1 rounded-md text-sm font-medium border border-blue-100 font-bold italic">🔥 ยอดชม ${latestViewsFormatted} ครั้ง</span>
                    </div>

                    <hr class="border-slate-100 mb-8" />

                    <div class="space-y-4">
                        <h3 class="text-lg font-black text-slate-800 flex items-center gap-2">
                            <span class="w-1.5 h-5 bg-[#003399] rounded-full"></span>
                            ข้อมูลเบื้องต้น และ ไฮไลท์ ของหอพัก
                        </h3>

                        <div class="relative group w-full">
                            <div class="absolute -inset-2 bg-gradient-to-r from-blue-600 via-purple-500 to-cyan-400 rounded-2xl blur-2xl opacity-50 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                            
                            <button onclick="toggleAiChat()" 
                                class="relative flex items-center justify-center gap-3 w-full bg-slate-950 text-white py-4 px-6 rounded-xl font-bold text-base hover:bg-black transition-all overflow-hidden border border-white/10">
                                
                                <div class="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]"></div>

                                <div class="relative z-10 flex items-center justify-center w-8 h-8 bg-white/10 rounded-lg">
                                    <span class="text-lg animate-pulse">🤖</span>
                                </div>

                                <span class="relative z-10 bg-gradient-to-r from-blue-100 via-white to-cyan-100 bg-clip-text text-transparent tracking-wide">
                                    ถาม AI พี่หอพัก เพื่อดูรายละเอียดของหอพัก
                                </span>

                                <svg class="relative z-10 w-4 h-4 text-blue-300 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>

                        <div class="flex items-center justify-center gap-1.5 opacity-60">
                            <span class="relative flex h-2 w-2">
                                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <p class="text-[16px] text-slate-500 font-medium italic">
                                กดเพื่อสอบถามข้อมูล รายละเอียด และเงื่อนไขต่างๆ กับ AI Assistant
                            </p>
                        </div>
                    </div>

                    <div class="mb-10">
                        <h3 class="text-lg font-bold text-slate-900 mb-4">สิ่งอำนวยความสะดวก</h3>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 px-2">
                            ${amenitiesHTML ? amenitiesHTML : `
                                <div class="col-span-full py-4">
                                    <p class="text-slate-400 italic text-sm">ไม่มีข้อมูลสิ่งอำนวยความสะดวก</p>
                                </div>
                            `}
                        </div>
                    </div>
                </div>

                <div class="lg:col-span-1">
                    <div class="sticky top-8 bg-white border border-slate-200 p-6 rounded-2xl shadow-xl shadow-slate-200/20">
                        <div class="flex justify-between items-start mb-1">
                            <div class="bg-blue-600 text-white p-2 rounded-lg text-center leading-tight">
                                <div class="text-lg font-bold">8.5</div>
                                <div class="text-[8px] uppercase">ดีเยี่ยม</div>
                            </div>
                            <div class="text-right">
                                <p class="text-xs text-slate-400 line-through">฿${(dorm.price_start + 500).toLocaleString()}</p>
                                <p class="text-3xl font-bold text-orange-600">฿${dorm.price_start.toLocaleString()}</p>
                                <p class="text-[10px] text-slate-400 uppercase">ราคาดีที่สุดต่อเดือน</p>
                            </div>
                        </div>

                        <div class="my-6 space-y-3">
                            <button onclick="openBookingModal(${dorm.id}, null, '${dorm.name}')"
                                    class="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
                                จองเลยตอนนี้
                            </button>
                            
                            <button onclick="scrollToRoomTypes(${dorm.id}, '${dorm.name}')" 
                                    class="w-full bg-white text-blue-600 border border-blue-600 py-3 rounded-xl font-bold text-sm hover:bg-blue-50 transition-all">
                                เลือกประเภทห้องพัก
                            </button>
                        </div>

                        <div class="pt-6 border-t border-slate-100 space-y-3">
                            <a href="tel:${dorm.contact_number}" class="flex items-center gap-3 text-slate-600 hover:text-blue-600 text-sm font-medium">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                                ${formattedPhone}
                            </a>
                            ${dorm.google_map_link ? `
                                <a href="${dorm.google_map_link}" target="_blank" class="flex items-center gap-3 text-slate-600 hover:text-red-500 text-sm font-medium">
                                    <svg class="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"></path></svg>
                                    ดูตำแหน่งบนแผนที่
                                </a>
                            ` : ''}
                        </div>

                        
                    </div>
                </div>
            </div>
            
            <div id="ai-chat-container" class="hidden fixed bottom-6 right-6 w-96 h-[500px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col z-[110] overflow-hidden">
                <div class="p-4 bg-slate-900 text-white flex justify-between items-center">
                    <span class="font-bold text-sm">AI Assistant - ${dorm.name}</span>
                    <button onclick="toggleAiChat()" class="text-slate-400 hover:text-white">✕</button>
                </div>
                <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 text-sm"></div>
                <div class="p-4 border-t flex gap-2">
                    <input type="text" id="ai-user-input" placeholder="พิมพ์คำถาม..." class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                    <button onclick="sendAiMessage()" class="bg-blue-600 text-white px-4 rounded-lg">ส่ง</button>
                </div>
            </div>
        `;

        // ==========================================
        // ✨ แทรกตรงนี้: เตรียมความพร้อมสำหรับ AI Chat
        // ==========================================
        currentActiveDormId = dormId; // บอกให้ AI รู้ว่าคุยกับหอนี้อยู่

        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            // เคลียร์แชทเก่า และใส่คำทักทายที่มีชื่อหอพักลงไปเพื่อให้ดูเป็นส่วนตัวขึ้น
            chatMessages.innerHTML = `
                <div class="flex justify-start animate-in fade-in slide-in-from-bottom-2">
                    <div class="bg-white text-slate-700 p-3 rounded-2xl rounded-bl-none shadow-sm border border-slate-100 max-w-[80%] text-sm">
                        Sawasdee ka! ฉันเป็น AI ผู้ช่วยของ <b>${dorm.name}</b> มีอะไรสอบถามเกี่ยวกับหอนี้ พิมพ์ทิ้งไว้ได้เลย kaa! 🤖
                    </div>
                </div>
            `;
        }
        // ==========================================

        
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

    const aiInput = document.getElementById('ai-user-input');
    if (aiInput) {
        aiInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                sendAiMessage();
            }
        });
    }
}


// ฟังก์ชันสำหรับเปิด Modal เลือกประเภทห้อง
function scrollToRoomTypes(dormId, dormName) {
    // ปิด Modal รายละเอียดหอพักก่อน
    document.getElementById('publicDormModal').classList.add('hidden');

    const container = document.getElementById('roomTypeListContainer');
    
    if (!currentRoomTypes || currentRoomTypes.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-400 py-10">ขออภัย ไม่มีข้อมูลประเภทห้องพักในขณะนี้</p>`;
    } else {
        container.innerHTML = currentRoomTypes.map(room => {
            const roomImg = room.room_images && room.room_images.length > 0 
                ? `/static/uploads/dorms/${room.room_images[0].filename}` 
                : 'https://images.unsplash.com/photo-1522771739844-649f6d175d97';

            return `
                <div class="group flex items-center gap-6 p-6 bg-slate-50 border-2 border-slate-50 rounded-[2rem] hover:border-indigo-500 hover:bg-white transition-all cursor-pointer shadow-sm hover:shadow-xl"
                    onclick="openRoomDetail(${room.id}, ${dormId}, '${dormName}')">
                    <div class="w-24 h-24 rounded-2xl overflow-hidden shrink-0 bg-slate-200">
                        <img src="${roomImg}" class="w-full h-full object-cover group-hover:scale-110 transition duration-500">
                    </div>
                    <div class="flex-grow">
                        <h4 class="text-xl font-bold text-slate-900 mb-1">${room.name}</h4>
                        <p class="text-sm text-slate-500 line-clamp-1">
                            ${room.has_air_conditioner ? 'แอร์, ' : ''}${room.has_water_heater ? 'เครื่องทำน้ำอุ่น, ' : ''}${room.description || ''}
                        </p>
                        <div class="mt-2 flex items-center gap-4">
                            <span class="text-indigo-600 font-black text-lg">฿${room.price.toLocaleString()}</span>
                            <span class="text-[10px] px-2 py-1 ${room.vacancy_count > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'} rounded-md font-bold uppercase">
                                ${room.vacancy_count > 0 ? `ว่าง ${room.vacancy_count} ห้อง` : 'เต็มแล้ว'}
                            </span>
                        </div>
                    </div>
                    <div class="p-3 bg-white rounded-xl shadow-sm text-indigo-500 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </div>
                </div>
            `;
        }).join('');
    }
    document.getElementById('roomTypeModal').classList.remove('hidden');
}


// ฟังก์ชันสำหรับปิด Modal เลือกประเภทห้อง
function closeRoomTypeModal() {
    document.getElementById('roomTypeModal').classList.add('hidden');
    // ถ้าอยากให้ปิดแล้วกลับไปหน้ารายละเอียดหอพักเลย ให้เปิดบรรทัดล่างนี้:
    // document.getElementById('publicDormModal').classList.remove('hidden');
}




// เลื่อนไปรูปถัดไป
function nextRoomImg(event) {
    event.stopPropagation(); // กันไม่ให้ไป trigger การกดขยายภาพ
    currentRoomImgIdx = (currentRoomImgIdx + 1) % currentRoomImages.length;
    updateRoomImgUI();
}

// เลื่อนกลับรูปก่อนหน้า
function prevRoomImg(event) {
    event.stopPropagation();
    currentRoomImgIdx = (currentRoomImgIdx - 1 + currentRoomImages.length) % currentRoomImages.length;
    updateRoomImgUI();
}

// อัปเดตการแสดงผลรูปภาพ
function updateRoomImgUI() {
    const imgTag = document.getElementById('mainRoomImg');
    const idxTag = document.getElementById('roomImgIdxDisplay');
    if (imgTag) imgTag.src = currentRoomImages[currentRoomImgIdx];
    if (idxTag) idxTag.innerText = currentRoomImgIdx + 1;
}

// ✅ ฟังก์ชันสำหรับกดดูรูปใหญ่ (ขยายภาพ)
function expandRoomImage() {
    if (currentRoomImages && currentRoomImages.length > 0) {
        // 1. อัปเดตรายการรูปที่จะใช้ใน Lightbox เป็นรูปจากห้องพัก
        currentImages = [...currentRoomImages]; 
        
        // 2. สั่งเปิด Lightbox โดยเริ่มจาก index ปัจจุบันที่ดูอยู่
        openLightbox(currentRoomImgIdx);
    }
}


// ฟังก์ชันปิด Modal
function closeRoomDetail() {
    const modal = document.getElementById('roomDetailModal');
    modal.classList.add('hidden');
    // ไม่ต้องปลด overflow hidden ของ body เพราะเรายังซ้อนอยู่บน Modal หอพัก
}

// ฟังก์ชันเปิด Modal รายละเอียดห้อง
async function openRoomDetail(roomId, dormId, dormName) {

    // 1. ดึงข้อมูลหอพักล่าสุดจาก API ก่อน เพื่อให้ได้ vacancy_count ที่เป็นปัจจุบันที่สุด
    try {
        const response = await fetch(`/api/public/dorms/${dormId}?t=${new Date().getTime()}`);
        if (response.ok) {
            const latestDormData = await response.json();
            // อัปเดตตัวแปร Global ด้วยข้อมูลใหม่ล่าสุด
            currentRoomTypes = latestDormData.room_types; 
        }
    } catch (err) {
        console.error("ไม่สามารถอัปเดตข้อมูลห้องพักล่าสุดได้:", err);
        // ถ้าดึงใหม่ไม่ได้ ให้ใช้ข้อมูลเก่าใน currentRoomTypes ประทังไปก่อน
    }

    // 2. ค้นหาห้องจากข้อมูลที่อัปเดตแล้ว
    const room = currentRoomTypes.find(r => r.id === roomId);
    if (!room) return;

    // ✅ เก็บรูปภาพทั้งหมดเข้าตัวแปร Global
    currentRoomImages = room.room_images && room.room_images.length > 0 
        ? room.room_images.map(img => `/static/uploads/dorms/${img.filename}`)
        : ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=800'];
    
    currentRoomImgIdx = 0; // เริ่มที่รูปแรกเสมอ

    const modal = document.getElementById('roomDetailModal');
    const content = document.getElementById('roomDetailContent');

    // ... (ส่วน amenitiesHTML เหมือนเดิม) ...
    const roomAmenities = [
        { key: 'has_air_conditioner', label: 'แอร์', icon: '❄️' },
        { key: 'has_fan', label: 'พัดลม', icon: '🍃' },
        { key: 'has_refrigerator', label: 'ตู้เย็น', icon: '🧊' },
        { key: 'has_tv', label: 'ทีวี', icon: '📺' },
        { key: 'has_water_heater', label: 'เครื่องทำน้ำอุ่น', icon: '🚿' },
        { key: 'has_balcony', label: 'ระเบียง', icon: '🌅' },
        { key: 'has_kitchen_sink', label: 'ซิงค์ล้างจาน', icon: '🚰' },
        { key: 'has_microwave', label: 'ไมโครเวฟ', icon: '🍱' }
    ];
    const amenitiesHTML = roomAmenities.filter(a => room[a.key]).map(a => `
        <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span>${a.icon}</span><span class="text-sm font-bold text-slate-700">${a.label}</span>
        </div>
    `).join('');


    // 3. วาด HTML (ตอนนี้ room.vacancy_count จะเป็นค่าล่าสุดแล้ว)
    content.innerHTML = `
        <div class="md:w-1/2 h-[400px] md:h-auto relative bg-slate-900 group">
            <img id="mainRoomImg" src="${currentRoomImages[0]}" 
                 onclick="expandRoomImage()"
                 class="w-full h-full object-cover cursor-zoom-in transition duration-500" 
                 onerror="this.src='https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=800'">
            
            ${currentRoomImages.length > 1 ? `
                <div class="absolute inset-0 flex items-center justify-between px-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="prevRoomImg(event)" class="p-2 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white hover:text-slate-900 transition-all">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                    </button>
                    <button onclick="nextRoomImg(event)" class="p-2 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white hover:text-slate-900 transition-all">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </button>
                </div>
                <div class="absolute bottom-6 right-6 bg-black/50 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-medium">
                    <span id="roomImgIdxDisplay">1</span> / ${currentRoomImages.length}
                </div>
            ` : ''}

            <div class="absolute bottom-6 left-6">
                <span class="bg-white/90 backdrop-blur-md px-4 py-2 rounded-full text-indigo-600 font-black shadow-lg">
                    ฿${room.price.toLocaleString()} /เดือน
                </span>
            </div>
        </div>

        <div class="md:w-1/2 p-10 overflow-y-auto max-h-[80vh]">
            <div class="mb-6">
                <h3 class="text-3xl font-black text-slate-900 mb-2">${room.name}</h3>
                <span class="px-3 py-1 ${room.vacancy_count > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'} rounded-lg text-xs font-bold uppercase tracking-wider">
                    ${room.vacancy_count > 0 ? `ว่าง ${room.vacancy_count} ห้อง` : 'เต็มแล้ว'}
                </span>
            </div>
            
            <div class="mb-8">
                <h4 class="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-4">สิ่งอำนวยความสะดวกในห้อง</h4>
                <div class="grid grid-cols-2 gap-3">${amenitiesHTML || '<p class="text-slate-400 italic">ไม่มีข้อมูล</p>'}</div>
            </div>

            <div class="mb-8">
                <h4 class="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-3">รายละเอียดเพิ่มเติม</h4>
                <p class="text-slate-600 leading-relaxed text-sm">${room.description || '-'}</p>
            </div>

            <button onclick="openBookingModal(${dormId}, ${room.id}, '${dormName} (${room.name})')"
                    ${room.vacancy_count <= 0 ? 'disabled' : ''}
                    class="w-full py-4 ${room.vacancy_count > 0 ? 'bg-gradient-to-r from-indigo-600 to-blue-600' : 'bg-slate-400 cursor-not-allowed'} text-white rounded-2xl font-black text-sm uppercase tracking-wider shadow-lg shadow-indigo-200 hover:shadow-indigo-400 hover:-translate-y-0.5 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 mb-4">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                </svg>
                ${room.vacancy_count > 0 ? 'จองห้องพักตอนนี้' : 'ห้องเต็มแล้ว ไม่สามารถจองได้'}
            </button>

            <button onclick="closeRoomDetail()" class="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold hover:bg-slate-200 transition-all active:scale-95">ปิดหน้าต่างนี้</button>
        </div>
    `;

    modal.classList.remove('hidden');
}






// ฟังก์ชันเปิด Lightbox
function openLightbox(index) {
    if (!currentDormImages || currentDormImages.length === 0) return;
    
    currentLightboxIndex = index;
    const modal = document.getElementById('lightboxModal');
    const img = document.getElementById('lightboxImage');
    const caption = document.getElementById('lightboxCaption');

    img.src = currentDormImages[currentLightboxIndex];
    caption.innerText = `รูปภาพที่ ${currentLightboxIndex + 1} / ${currentDormImages.length}`;
    
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // กันไม่ให้เลื่อนหน้าจอเบื้องหลัง
}

// ฟังก์ชันปิด Lightbox
function closeLightbox() {
    const modal = document.getElementById('lightboxModal');
    modal.classList.add('hidden');
    // ถ้า Modal รายละเอียดหอพักยังเปิดอยู่ ไม่ต้องปลด lock overflow
    if (document.getElementById('publicDormModal').classList.contains('hidden')) {
        document.body.style.overflow = 'auto';
    }
}


// ฟังก์ชันเลื่อนรูป ซ้าย-ขวา
function changeLightboxImage(direction) {
    // แก้จาก currentImages เป็น currentDormImages ให้ตรงกับที่ประกาศไว้ข้างบน
    if (!currentDormImages || currentDormImages.length === 0) return;

    currentLightboxIndex += direction;

    // วนลูปรูปภาพ
    if (currentLightboxIndex >= currentDormImages.length) {
        currentLightboxIndex = 0;
    } else if (currentLightboxIndex < 0) {
        currentLightboxIndex = currentDormImages.length - 1;
    }

    const img = document.getElementById('lightboxImage');
    const caption = document.getElementById('lightboxCaption');
    
    // ใส่ Effect ค่อยๆ ปรากฏ
    img.style.opacity = '0';
    setTimeout(() => {
        img.src = currentDormImages[currentLightboxIndex];
        caption.innerText = `รูปภาพที่ ${currentLightboxIndex + 1} / ${currentDormImages.length}`;
        img.style.opacity = '1';
    }, 150);
}


// ✅ ฟังก์ชันอัปเดตการแสดงผล (ให้รองรับทั้ง ID แบบ CamelCase และ kebab-case)
function updateLightbox() {
    const img = document.getElementById('lightboxImg') || document.getElementById('lightbox-img');
    const counter = document.getElementById('lightboxCaption') || document.getElementById('lightbox-counter');
    
    if (img) img.src = currentImages[currentImageIndex];
    if (counter) counter.innerText = `รูปภาพที่ ${currentImageIndex + 1} / ${currentImages.length}`;
}

// ฟังก์ชันปุ่มถัดไปใน Lightbox
function prevImage() {
    changeLightboxImage(-1);
}


// เพิ่ม Event Listener สำหรับกดปุ่มบน Keyboard
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('lightboxModal');
    if (modal.classList.contains('hidden')) return;

    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') changeLightboxImage(1);
    if (e.key === 'ArrowLeft') changeLightboxImage(-1);
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
function openBookingModal(dormId, roomTypeId = null, dormName = "หอพัก") {
    console.log("🟢 [Step 1] รับค่าเข้ามา:", { dormId, roomTypeId, dormName });

    window.currentSelectedRoomTypeId = roomTypeId; 

    const dormIdInput = document.getElementById('booking-dorm-id');
    if (dormIdInput) {
        dormIdInput.value = dormId; // หยอดค่า
        console.log("🟢 [Step 2] หยอด ID ลง Input แล้ว:", dormIdInput.value);
    } else {
        console.error("🔴 [Error] หา Element #booking-dorm-id ไม่เจอใน HTML!");
    }

    // ส่วนที่เหลือเหมือนเดิม...
    const dormNameLabel = document.getElementById('booking-dorm-name');
    if (dormNameLabel) dormNameLabel.innerText = dormName;

    const modal = document.getElementById('bookingModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
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
    const form = e.currentTarget; 
    const btn = form.querySelector('button[type="submit"]');

    // --- จุดแก้ไขหลัก: ดึงค่าด้วย ID ตรงๆ เพื่อป้องกันโครงสร้าง HTML ซับซ้อน ---
    const dormIdInput = document.getElementById('booking-dorm-id');
    const rawDormId = dormIdInput ? dormIdInput.value : null;

    console.log("📍 Checkpoint - rawDormId:", rawDormId);

    // ตรวจสอบทั้งค่าว่าง และค่าที่เป็นตัวอักษร "undefined" / "null"
    if (!rawDormId || rawDormId === "undefined" || rawDormId === "null") {
        Swal.fire({
            icon: 'error',
            title: 'ข้อมูลไม่ครบ',
            text: 'ไม่พบรหัสหอพัก (ID หลุด) กรุณาปิดหน้าต่างนี้แล้วลองกดจองใหม่อีกครั้ง'
        });
        return;
    }

    // เตรียมข้อมูล Payload
    const formData = {
        dorm_id: parseInt(rawDormId),
        // ใช้ตัวแปร Global ที่เราเก็บไว้ตอนเปิด Modal
        room_type_id: window.currentSelectedRoomTypeId ? parseInt(window.currentSelectedRoomTypeId) : null,
        guest_name: document.getElementById('booking-guest-name')?.value.trim() || "",
        guest_phone: document.getElementById('booking-guest-phone')?.value.trim() || "",
        check_in_date: document.getElementById('booking-check-in-date')?.value || "",
        remark: document.getElementById('booking-remark')?.value.trim() || ""
    };

    console.log("🚀 Payload ready:", formData);

    // ตรวจสอบความถูกต้องของ dorm_id ก่อนส่ง
    if (isNaN(formData.dorm_id)) {
        Swal.fire('Error', 'รหัสหอพักไม่ถูกต้อง (NaN)', 'error');
        return;
    }

    try {
        btn.innerText = "กำลังส่งข้อมูล...";
        btn.disabled = true;

        const response = await fetch('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const resultData = await response.json();

        if (response.ok) {
            Swal.fire({ 
                icon: 'success', 
                title: 'จองหอพักสำเร็จ!', 
                text: 'เจ้าหน้าที่ได้รับข้อมูลการจองของคุณแล้ว',
                confirmButtonColor: '#003399' 
            });
            
            // ใช้ฟังก์ชันปิด Modal ที่คุณมี
            if (typeof closeBookingModal === 'function') {
                closeBookingModal();
            } else {
                document.getElementById('bookingModal').classList.add('hidden');
                document.body.style.overflow = 'auto';
            }
            
            form.reset(); 

            // ✅ เพิ่มบรรทัดนี้: โหลดรายการหอพักใหม่เพื่อให้จำนวน vacancy_count อัปเดตบนหน้าเว็บ
            fetchRecommendedDorms();

            // ถ้าอยากให้อัปเดตเลขในหน้าหน้าต่างรายละเอียดที่เปิดค้างไว้ด้วย
            if (typeof viewDormDetail === 'function' && rawDormId) {
                viewDormDetail(parseInt(rawDormId)); 
            }

        } else {
            // ถ้า Server ตอบกลับ error (เช่น 422) จะมาตกที่นี่
            const errorMsg = Array.isArray(resultData.detail) 
                ? resultData.detail.map(d => d.msg).join(', ') 
                : (resultData.detail || 'เกิดข้อผิดพลาดในการส่งข้อมูล');
            throw new Error(errorMsg);
        }
    } catch (error) {
        console.error("Submit Error:", error);
        Swal.fire('ส่งข้อมูลไม่สำเร็จ', error.message, 'error');
    } finally {
        btn.innerHTML = `ส่งข้อมูลการจอง <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`;
        btn.disabled = false;
    }
});



function toggleFilterSection() {
    const sidebar = document.getElementById('filter-sidebar');
    const overlay = document.getElementById('filter-overlay');
    
    if (sidebar.classList.contains('-translate-x-full')) {
        // เปิด Sidebar
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.add('opacity-100'), 10);
        document.body.style.overflow = 'hidden'; // กันเลื่อนหน้าหลัก
    } else {
        // ปิด Sidebar
        sidebar.classList.add('-translate-x-full');
        overlay.classList.remove('opacity-100');
        setTimeout(() => {
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
        }, 300);
    }
}


// ----- AI ------

// 1. ฟังก์ชัน เปิด/ปิด หน้าต่างแชท
function toggleAiChat() {
    const chatWindow = document.getElementById('ai-chat-container');
    if (!chatWindow) return;

    chatWindow.classList.toggle('hidden');
    
    // ถ้าเปิดหน้าต่างขึ้นมา ให้ Focus ที่ช่องพิมพ์ทันที
    if (!chatWindow.classList.contains('hidden')) {
        document.getElementById('ai-user-input')?.focus();
    }
}

// 2. ฟังก์ชันแสดงข้อความในหน้าจอแชท
function appendMessage(role, text) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 mb-4`;
    
    const innerDiv = document.createElement('div');
    innerDiv.className = role === 'user' 
        ? 'bg-indigo-600 text-white p-3 rounded-2xl rounded-br-none shadow-md max-w-[80%] text-sm'
        : 'bg-white text-slate-700 p-3 rounded-2xl rounded-bl-none shadow-sm border border-slate-100 max-w-[80%] text-sm';
    
    innerDiv.innerHTML = text; // ใช้ innerHTML เผื่อกรณี AI ตอบกลับมาเป็นตัวหนาหรือรายการ
    msgDiv.appendChild(innerDiv);
    chatMessages.appendChild(msgDiv);
    
    // Scroll ลงล่างสุดให้เห็นข้อความใหม่
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 3. ฟังก์ชันส่งข้อความ (เชื่อมกับช่อง ai-user-input)
async function sendAiMessage() {
    const input = document.getElementById('ai-user-input');
    if (!input) return;

    const message = input.value.trim();
    
    // ตรวจสอบความพร้อม: ต้องมีข้อความ และต้องรู้ว่าคุยกับหอพักไหน (currentActiveDormId)
    if (!message || typeof currentActiveDormId === 'undefined') return;

    // แสดงข้อความที่เราพิมพ์
    appendMessage('user', message);
    input.value = ''; // เคลียร์ช่องพิมพ์
    
    // แสดงสถานะ Loading (AI กำลังพิมพ์...)
    const loadingId = 'loading-' + Date.now();
    const chatMessages = document.getElementById('chat-messages');
    const loadingDiv = document.createElement('div');
    loadingDiv.id = loadingId;
    loadingDiv.className = "text-[10px] text-slate-400 italic ml-2 mb-4";
    loadingDiv.innerText = "AI กำลังพิมพ์...";
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        const response = await fetch(`/api/public/dorms/${currentActiveDormId}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message })
        });

        const data = await response.json();
        
        // ลบตัว Loading ออกเมื่อได้รับคำตอบ
        document.getElementById(loadingId)?.remove();

        if (response.ok) {
            // รองรับทั้ง data.answer และ data.response
            appendMessage('ai', data.answer || data.response); 
        } else {
            appendMessage('ai', `ขออภัยครับ: ${data.detail || 'เกิดข้อผิดพลาดในการรับข้อมูล'}`);
        }
    } catch (error) {
        // ลบตัว Loading ออกหากเกิด Error
        document.getElementById(loadingId)?.remove();
        appendMessage('ai', 'ขออภัยครับ ไม่สามารถเชื่อมต่อกับ AI Assistant ได้ในขณะนี้');
        console.error("AI Chat Error:", error);
    }
}

// ตรวจสอบการกด Enter ใน Input
// ดักจับปุ่ม Enter ครั้งเดียวที่ระดับหน้าจอ (Global)
document.addEventListener('keypress', function (e) {
    if (e.key === 'Enter' && e.target.id === 'ai-user-input') {
        sendAiMessage();
    }
});



// เริ่มต้นทำงาน
document.addEventListener('DOMContentLoaded', () => {
    fetchRecommendedDorms();
    getOrCreateVisitorId();
});