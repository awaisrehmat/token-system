document.querySelectorAll('.delete-form').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (!window.confirm('Are you sure you want to delete this record?')) {
      event.preventDefault();
    }
  });
});

const sidebar = document.querySelector('#adminSidebar');
const sidebarToggle = document.querySelector('#sidebarToggle');
const sidebarBackdrop = document.querySelector('#sidebarBackdrop');

function setSidebar(open) {
  document.body.classList.toggle('sidebar-open', open);
  sidebarToggle?.setAttribute('aria-expanded', String(open));
}

sidebarToggle?.addEventListener('click', () => {
  setSidebar(!document.body.classList.contains('sidebar-open'));
});
sidebarBackdrop?.addEventListener('click', () => setSidebar(false));
sidebar?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => setSidebar(false));
});

const cnicInput = document.querySelector('#cnic');
if (cnicInput) {
  const formatCnic = () => {
    const digits = cnicInput.value.replace(/\D/g, '').slice(0, 13);
    let formatted = digits.slice(0, 5);
    if (digits.length > 5) formatted += `-${digits.slice(5, 12)}`;
    if (digits.length > 12) formatted += `-${digits.slice(12)}`;
    cnicInput.value = formatted;
  };

  cnicInput.addEventListener('input', formatCnic);
  formatCnic();
}

document.querySelectorAll('.new-token-button').forEach((button) => {
  button.addEventListener('click', () => {
    const form = document.querySelector('#newTokenForm');
    const patientLabel = document.querySelector('#newTokenPatient');
    const physicianSelect = document.querySelector('#repeatConsultant');
    const description = document.querySelector('#repeatDescription');
    const patientType = document.querySelector('#repeatPatientType');

    form.action = `/patients/${button.dataset.patientId}/revisit`;
    patientLabel.textContent = `${button.dataset.mrNumber} · ${button.dataset.patientName}`;
    physicianSelect.value = button.dataset.physicianId || '';
    patientType.value = 'Follow-up';
    description.value = '';
  });
});

document.querySelectorAll('form[method="post"]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (event.defaultPrevented) return;

    const submitButtons = form.querySelectorAll('button[type="submit"], input[type="submit"]');
    submitButtons.forEach((button) => {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');

      if (button.tagName === 'BUTTON') {
        button.dataset.originalHtml = button.innerHTML;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> Please wait...';
      }
    });
  });
});
