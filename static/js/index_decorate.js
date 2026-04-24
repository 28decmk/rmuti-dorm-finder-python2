// ไฟล์: decorate/index.js

function toggleModal() {
    const modal = document.getElementById('loginModal');
    if (!modal) return;

    const modalContent = modal.querySelector('.modal-content');

    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.add('opacity-100');
            if (modalContent) {
                modalContent.classList.add('scale-100', 'opacity-100');
                modalContent.classList.remove('scale-95', 'opacity-0');
            }
        }, 10);
        document.body.style.overflow = 'hidden';
    } else {
        modal.classList.remove('opacity-100');
        if (modalContent) {
            modalContent.classList.remove('scale-100', 'opacity-100');
            modalContent.classList.add('scale-95', 'opacity-0');
        }
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
        document.body.style.overflow = 'auto';
    }
}

// ฟังก์ชันควบคุม Register Modal
function toggleRegisterModal() {
    const modal = document.getElementById('registerModal');
    const content = modal.querySelector('.modal-content');
    
    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.add('opacity-100');
            content.classList.add('opacity-100', 'scale-100');
        }, 10);
    } else {
        content.classList.remove('opacity-100', 'scale-100');
        modal.classList.remove('opacity-100');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    }
}

// ฟังก์ชันสลับจาก Login ไป Register
function switchToRegister() {
    toggleModal(); // ปิดหน้า Login
    setTimeout(toggleRegisterModal, 350); // เปิดหน้า Register
}

// ฟังก์ชันสลับจาก Register ไป Login
function switchToLogin() {
    toggleRegisterModal(); // ปิดหน้า Register
    setTimeout(toggleModal, 350); // เปิดหน้า Login
}

// เช็คการคลิกข้างนอก Modal
window.onclick = function(event) {
    const modal = document.getElementById('loginModal');
    // ต้องเช็คว่า event.target คือตัว modal (backdrop) หรือไม่
    if (event.target === modal) {
        toggleModal();
    }
};