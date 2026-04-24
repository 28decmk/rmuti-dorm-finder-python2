import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '30s', target: 50 },  // ค่อยๆ เพิ่มคน
        { duration: '1m', target: 150 }, // ทดสอบที่ 150 คน (กำลังดีสำหรับ Codespaces)
        { duration: '30s', target: 0 },   // ลดจำนวนคน
    ],
    thresholds: {
        http_req_duration: ['p(95)<800'], // ยอมให้ช้าได้นิดหน่อยเพราะ Codespaces spec ต่ำ
        http_req_failed: ['rate<0.05'],   // Error ต้องไม่เกิน 5%
    },
};

export default function () {
    const BASE_URL = 'https://humble-trout-4j6w69vjx4g4hj759-8000.app.github.dev';
    
    // --- สุ่มข้อมูลหอพักที่มีจริงของคุณ ---
    const dormIds = [45, 44, 34, 11, 10]; // 👈 สำคัญ: เช็ค ID ใน DB ของคุณว่าบ้านบัง ID อะไรบ้าง
    const randomId = dormIds[Math.floor(Math.random() * dormIds.length)];
    const searchTerms = ['บ้านบัง', '966', '600', 'หอพัก'];
    const searchTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];

    // Scenario 1: นักศึกษาโหลดหน้าแรก (เน้น Redis)
    let resIndex = http.get(`${BASE_URL}/api/public/dorms`);
    check(resIndex, { 'index status 200': (r) => r.status === 200 });

    sleep(1);

    // Scenario 2: ค้นหาด้วยคำว่า "บ้านบัง" (เน้น Filter Logic)
    let resSearch = http.get(`${BASE_URL}/api/public/search?q=${encodeURIComponent(searchTerm)}`);
    check(resSearch, { 'search status 200': (r) => r.status === 200 });

    sleep(1);

    // Scenario 3: ดูรายละเอียดหอพัก (สุ่ม ID)
    let resDetail = http.get(`${BASE_URL}/api/public/dorms/${randomId}`);
    check(resDetail, { 
        'detail status 200': (r) => r.status === 200,
        'is verified': (r) => !r.body.includes("ไม่พบข้อมูลหอพัก") 
    });

    // Scenario 4: บันทึกยอดวิว (ตัวทำระบบหน่วง)
    let payload = JSON.stringify({ visitor_id: `test-${__VU}-${__ITER}` });
    let params = { headers: { 'Content-Type': 'application/json' } };
    http.post(`${BASE_URL}/api/public/dorms/${randomId}/view`, payload, params);

    sleep(2);
}