/**
 * auth.js — W.H. Academy
 * Drives login.html's multi-step flow: Login, Forgot PIN, OTP
 * Verification, Registration. Talks to the backend exclusively through
 * api.js, matching the exact operation names Auth.gs/OTP.gs/Registration.gs expose.
 */

const Auth = (() => {

  let registrationContext = { studentId: null, purpose: null };/**
 * auth.js — W.H. Academy
 * Drives login.html's multi-step flow: Login, Forgot PIN, OTP
 * Verification, Registration. Talks to the backend exclusively through
 * api.js, matching the exact operation names Auth.gs/OTP.gs/Registration.gs expose.
 */

const Auth = (() => {

  let registrationContext = { studentId: null, purpose: null };

  function setButtonLoading(btn, isLoading) {
    btn.disabled = isLoading;
    btn.dataset.loading = isLoading ? 'true' : 'false';
  }

  function showFieldError(fieldEl, message) {
    const errorEl = fieldEl.querySelector('.field__error');
    const inputEl = fieldEl.querySelector('.input');
    if (message) {
      if (errorEl) errorEl.textContent = message;
      if (inputEl) inputEl.setAttribute('aria-invalid', 'true');
    } else {
      if (errorEl) errorEl.textContent = '';
      if (inputEl) inputEl.removeAttribute('aria-invalid');
    }
  }

  // ---- Login ----
  async function handleLoginSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const studentId = form.studentId.value.trim().toUpperCase();
    const pin = form.pin.value;
    const rememberMe = form.rememberMe.checked;
    const submitBtn = form.querySelector('[type="submit"]');

    let hasError = false;
    if (!Utils.isValidStudentIdFormat(studentId)) {
      showFieldError(form.querySelector('[data-field="studentId"]'), 'Enter your Student ID exactly as it appears in your email, e.g. WHA-2026-C08-000001 or WHA-2026-C09-BIO-000001.');
      hasError = true;
    } else {
      showFieldError(form.querySelector('[data-field="studentId"]'), '');
    }
    if (!pin || pin.length < 4) {
      showFieldError(form.querySelector('[data-field="pin"]'), 'Enter your PIN.');
      hasError = true;
    } else {
      showFieldError(form.querySelector('[data-field="pin"]'), '');
    }
    if (hasError) return;

    setButtonLoading(submitBtn, true);
    try {
      const result = await Api.auth.login(studentId, pin, rememberMe);
      Storage.setToken(result.token);
      Storage.setStudentId(studentId);
      Notifications.success('Welcome back!');
      const redirect = Router.getQueryParam('redirect') || 'dashboard.html';
      window.location.href = redirect;
    } catch (err) {
      Notifications.error(err.message || 'Login failed. Please check your Student ID and PIN.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  // ---- Forgot PIN → OTP → Reset ----
  async function handleForgotPinSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const studentId = form.studentId.value.trim().toUpperCase();
    const email = form.email.value.trim();
    const submitBtn = form.querySelector('[type="submit"]');

    if (!Utils.isValidStudentIdFormat(studentId) || !Utils.isValidEmailFormat(email)) {
      Notifications.error('Enter a valid Student ID and email address.');
      return;
    }

    setButtonLoading(submitBtn, true);
    try {
      await Api.otp.request(studentId, email, '', 'PasswordReset');
      registrationContext = { studentId, purpose: 'PasswordReset' };
      Notifications.success('A verification code was sent to your email.');
      Router.showStep('otp-verification');
    } catch (err) {
      Notifications.error(err.message || 'Could not send a verification code. Check your details and try again.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  // ---- Registration: step 1 (identity) ----
  async function handleRegistrationStart(event) {
    event.preventDefault();
    const form = event.target;
    const studentId = form.studentId.value.trim().toUpperCase();
    const fullName = form.fullName.value.trim();
    const email = form.email.value.trim();
    const termsAccepted = form.termsAccepted.checked;
    const submitBtn = form.querySelector('[type="submit"]');

    if (!Utils.isValidStudentIdFormat(studentId)) {
      Notifications.error('Enter a valid Student ID.');
      return;
    }
    if (!termsAccepted) {
      Notifications.error('You must accept the terms to continue.');
      return;
    }

    setButtonLoading(submitBtn, true);
    try {
      await Api.otp.request(studentId, email, fullName, 'Registration');
      registrationContext = { studentId, purpose: 'Registration' };
      Notifications.success('A verification code was sent to your email.');
      Router.showStep('otp-verification');
    } catch (err) {
      Notifications.error(err.message || 'Registration could not be verified. Please check your details.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  // ---- OTP verification (shared by Registration and Forgot PIN) ----
  async function handleOtpSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const otpCode = form.otpCode.value.trim();
    const submitBtn = form.querySelector('[type="submit"]');

    if (!/^\d{6}$/.test(otpCode)) {
      Notifications.error('Enter the 6-digit code from your email.');
      return;
    }

    setButtonLoading(submitBtn, true);
    try {
      await Api.otp.verify(registrationContext.studentId, otpCode);
      Notifications.success('Verified.');
      Router.showStep(registrationContext.purpose === 'PasswordReset' ? 'set-new-pin' : 'set-pin');
    } catch (err) {
      Notifications.error(err.message || 'That code is incorrect or has expired.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  async function handleResendOtp(event) {
    event.preventDefault();
    try {
      await Api.otp.request(registrationContext.studentId, '', '', registrationContext.purpose);
      Notifications.success('A new code was sent.');
    } catch (err) {
      Notifications.error(err.message || 'Could not resend the code right now.');
    }
  }

  // ---- Set PIN (completes registration) ----
  async function handleSetPinSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const pin = form.pin.value;
    const confirmPin = form.confirmPin.value;
    const submitBtn = form.querySelector('[type="submit"]');

    if (!/^\d{4,8}$/.test(pin)) {
      Notifications.error('Your PIN must be 4–8 digits.');
      return;
    }
    if (pin !== confirmPin) {
      Notifications.error('PINs do not match.');
      return;
    }

    setButtonLoading(submitBtn, true);
    try {
      await Api.registration.complete(registrationContext.studentId, pin, confirmPin);
      Notifications.success('Your account is ready. Please log in.');
      Router.showStep('login');
    } catch (err) {
      Notifications.error(err.message || 'Could not complete registration.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  function initLoginPage() {
    const loginForm = Utils.qs('#login-form');
    const forgotPinForm = Utils.qs('#forgot-pin-form');
    const registrationForm = Utils.qs('#registration-form');
    const otpForm = Utils.qs('#otp-form');
    const setPinForm = Utils.qs('#set-pin-form');
    const resendLink = Utils.qs('#resend-otp-link');

    if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);
    if (forgotPinForm) forgotPinForm.addEventListener('submit', handleForgotPinSubmit);
    if (registrationForm) registrationForm.addEventListener('submit', handleRegistrationStart);
    if (otpForm) otpForm.addEventListener('submit', handleOtpSubmit);
    if (setPinForm) setPinForm.addEventListener('submit', handleSetPinSubmit);
    if (resendLink) resendLink.addEventListener('click', handleResendOtp);

    Utils.qsa('[data-goto-step]').forEach((btn) => {
      btn.addEventListener('click', () => Router.showStep(btn.dataset.gotoStep));
    });

    // OTP inputs auto-advance between the 6 boxes for a faster, more
    // accessible entry experience than one bare text field.
    const otpBoxes = Utils.qsa('.otp-box');
    if (otpBoxes.length) {
      const hiddenField = Utils.qs('#otp-code-hidden');
      otpBoxes.forEach((box, index) => {
        box.addEventListener('input', () => {
          if (box.value && index < otpBoxes.length - 1) otpBoxes[index + 1].focus();
          if (hiddenField) hiddenField.value = otpBoxes.map((b) => b.value).join('');
        });
        box.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !box.value && index > 0) otpBoxes[index - 1].focus();
        });
      });
    }

    // The Student-ID email links straight here with ?step=registration&id=...
    // Without this, initLoginPage() always forced the 'login' step, so the email
    // link (and welcome.html's "Register with Student ID" button, which has
    // pointed at ?step=registration all along) both dumped the student on the
    // login screen with a PIN they had not created yet.
    //
    // Only the two steps a student can legitimately START on are honoured.
    // 'otp-verification' and 'set-pin' are deliberately NOT allowed from a URL:
    // they are meaningless without the in-memory registrationContext set by the
    // step before them.
    const ALLOWED_ENTRY_STEPS = ['registration', 'forgot-pin'];
    const requestedStep = Router.getQueryParam('step');

    // Pre-fill the Student ID from the email link, so it is never retyped —
    // by far the easiest place for a student to make a typo.
    const prefillId = (Router.getQueryParam('id') || '').trim();
    if (prefillId) {
      const regIdField = Utils.qs('#reg-student-id');
      const loginIdField = Utils.qs('#login-student-id');
      const forgotIdField = Utils.qs('#forgot-student-id');
      if (regIdField) regIdField.value = prefillId;
      if (loginIdField) loginIdField.value = prefillId;
      if (forgotIdField) forgotIdField.value = prefillId;
    }

    let entryStep = 'login';

    if (ALLOWED_ENTRY_STEPS.indexOf(requestedStep) !== -1) {
      entryStep = requestedStep;

    } else if (requestedStep === 'otp-verification' && prefillId) {
      // A student arriving from the "Enter Your Code" button in their email.
      // registrationContext normally comes from the previous in-page step, which
      // they never saw — the Google Form did that part — so seed it from the URL.
      //
      // Safe: the 6-digit code is the only secret, and OTP.request sends it ONLY
      // to the address on file for that Student ID (Registration.verifyIdentityForOtp).
      // A Student ID in a link buys an attacker nothing without the code.
      registrationContext = { studentId: prefillId, purpose: 'Registration' };
      entryStep = 'otp-verification';

      const otpIdLabel = Utils.qs('#otp-student-id');
      if (otpIdLabel) otpIdLabel.textContent = prefillId;
    }

    // 'set-pin' is deliberately NOT reachable from a URL: it must only ever be
    // entered after OTP.verify() has actually succeeded.
    Router.showStep(entryStep);
  }

  return { initLoginPage };
})();

  function setButtonLoading(btn, isLoading) {
    btn.disabled = isLoading;
    btn.dataset.loading = isLoading ? 'true' : 'false';
  }

  function showFieldError(fieldEl, message) {
    const errorEl = fieldEl.querySelector('.field__error');
    const inputEl = fieldEl.querySelector('.input');
    if (message) {
      if (errorEl) errorEl.textContent = message;
      if (inputEl) inputEl.setAttribute('aria-invalid', 'true');
    } else {
      if (errorEl) errorEl.textContent = '';
      if (inputEl) inputEl.removeAttribute('aria-invalid');
    }
  }

  // ---- Login ----
  async function handleLoginSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const studentId = form.studentId.value.trim().toUpperCase();
    const pin = form.pin.value;
    const rememberMe = form.rememberMe.checked;
    const submitBtn = form.querySelector('[type="submit"]');

    let hasError = false;
    if (!Utils.isValidStudentIdFormat(studentId)) {
      showFieldError(form.querySelector('[data-field="studentId"]'), 'Enter your Student ID exactly as it appears in your email, e.g. WHA-2026-C08-000001 or WHA-2026-C09-BIO-000001.');
      hasError = true;
    } else {
      showFieldError(form.querySelector('[data-field="studentId"]'), '');
    }
    if (!pin || pin.length < 4) {
      showFieldError(form.querySelector('[data-field="pin"]'), 'Enter your PIN.');
      hasError = true;
    } else {
      showFieldError(form.querySelector('[data-field="pin"]'), '');
    }
    if (hasError) return;

    setButtonLoading(submitBtn, true);
    try {
      const result = await Api.auth.login(studentId, pin, rememberMe);
      Storage.setToken(result.token);
      Storage.setStudentId(studentId);
      Notifications.success('Welcome back!');
      const redirect = Router.getQueryParam('redirect') || 'dashboard.html';
      window.location.href = redirect;
    } catch (err) {
      Notifications.error(err.message || 'Login failed. Please check your Student ID and PIN.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  // ---- Forgot PIN → OTP → Reset ----
  async function handleForgotPinSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const studentId = form.studentId.value.trim().toUpperCase();
    const email = form.email.value.trim();
    const submitBtn = form.querySelector('[type="submit"]');

    if (!Utils.isValidStudentIdFormat(studentId) || !Utils.isValidEmailFormat(email)) {
      Notifications.error('Enter a valid Student ID and email address.');
      return;
    }

    setButtonLoading(submitBtn, true);
    try {
      await Api.otp.request(studentId, email, '', 'PasswordReset');
      registrationContext = { studentId, purpose: 'PasswordReset' };
      Notifications.success('A verification code was sent to your email.');
      Router.showStep('otp-verification');
    } catch (err) {
      Notifications.error(err.message || 'Could not send a verification code. Check your details and try again.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  // ---- Registration: step 1 (identity) ----
  async function handleRegistrationStart(event) {
    event.preventDefault();
    const form = event.target;
    const studentId = form.studentId.value.trim().toUpperCase();
    const fullName = form.fullName.value.trim();
    const email = form.email.value.trim();
    const termsAccepted = form.termsAccepted.checked;
    const submitBtn = form.querySelector('[type="submit"]');

    if (!Utils.isValidStudentIdFormat(studentId)) {
      Notifications.error('Enter a valid Student ID.');
      return;
    }
    if (!termsAccepted) {
      Notifications.error('You must accept the terms to continue.');
      return;
    }

    setButtonLoading(submitBtn, true);
    try {
      await Api.otp.request(studentId, email, fullName, 'Registration');
      registrationContext = { studentId, purpose: 'Registration' };
      Notifications.success('A verification code was sent to your email.');
      Router.showStep('otp-verification');
    } catch (err) {
      Notifications.error(err.message || 'Registration could not be verified. Please check your details.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  // ---- OTP verification (shared by Registration and Forgot PIN) ----
  async function handleOtpSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const otpCode = form.otpCode.value.trim();
    const submitBtn = form.querySelector('[type="submit"]');

    if (!/^\d{6}$/.test(otpCode)) {
      Notifications.error('Enter the 6-digit code from your email.');
      return;
    }

    setButtonLoading(submitBtn, true);
    try {
      await Api.otp.verify(registrationContext.studentId, otpCode);
      Notifications.success('Verified.');
      Router.showStep(registrationContext.purpose === 'PasswordReset' ? 'set-new-pin' : 'set-pin');
    } catch (err) {
      Notifications.error(err.message || 'That code is incorrect or has expired.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  async function handleResendOtp(event) {
    event.preventDefault();
    try {
      await Api.otp.request(registrationContext.studentId, '', '', registrationContext.purpose);
      Notifications.success('A new code was sent.');
    } catch (err) {
      Notifications.error(err.message || 'Could not resend the code right now.');
    }
  }

  // ---- Set PIN (completes registration) ----
  async function handleSetPinSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const pin = form.pin.value;
    const confirmPin = form.confirmPin.value;
    const submitBtn = form.querySelector('[type="submit"]');

    if (!/^\d{4,8}$/.test(pin)) {
      Notifications.error('Your PIN must be 4–8 digits.');
      return;
    }
    if (pin !== confirmPin) {
      Notifications.error('PINs do not match.');
      return;
    }

    setButtonLoading(submitBtn, true);
    try {
      await Api.registration.complete(registrationContext.studentId, pin, confirmPin);
      Notifications.success('Your account is ready. Please log in.');
      Router.showStep('login');
    } catch (err) {
      Notifications.error(err.message || 'Could not complete registration.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  function initLoginPage() {
    const loginForm = Utils.qs('#login-form');
    const forgotPinForm = Utils.qs('#forgot-pin-form');
    const registrationForm = Utils.qs('#registration-form');
    const otpForm = Utils.qs('#otp-form');
    const setPinForm = Utils.qs('#set-pin-form');
    const resendLink = Utils.qs('#resend-otp-link');

    if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);
    if (forgotPinForm) forgotPinForm.addEventListener('submit', handleForgotPinSubmit);
    if (registrationForm) registrationForm.addEventListener('submit', handleRegistrationStart);
    if (otpForm) otpForm.addEventListener('submit', handleOtpSubmit);
    if (setPinForm) setPinForm.addEventListener('submit', handleSetPinSubmit);
    if (resendLink) resendLink.addEventListener('click', handleResendOtp);

    Utils.qsa('[data-goto-step]').forEach((btn) => {
      btn.addEventListener('click', () => Router.showStep(btn.dataset.gotoStep));
    });

    // OTP inputs auto-advance between the 6 boxes for a faster, more
    // accessible entry experience than one bare text field.
    const otpBoxes = Utils.qsa('.otp-box');
    if (otpBoxes.length) {
      const hiddenField = Utils.qs('#otp-code-hidden');
      otpBoxes.forEach((box, index) => {
        box.addEventListener('input', () => {
          if (box.value && index < otpBoxes.length - 1) otpBoxes[index + 1].focus();
          if (hiddenField) hiddenField.value = otpBoxes.map((b) => b.value).join('');
        });
        box.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !box.value && index > 0) otpBoxes[index - 1].focus();
        });
      });
    }

    // The Student-ID email links straight here with ?step=registration&id=...
    // Without this, initLoginPage() always forced the 'login' step, so the email
    // link (and welcome.html's "Register with Student ID" button, which has
    // pointed at ?step=registration all along) both dumped the student on the
    // login screen with a PIN they had not created yet.
    //
    // Only the two steps a student can legitimately START on are honoured.
    // 'otp-verification' and 'set-pin' are deliberately NOT allowed from a URL:
    // they are meaningless without the in-memory registrationContext set by the
    // step before them.
    const ALLOWED_ENTRY_STEPS = ['registration', 'forgot-pin'];
    const requestedStep = Router.getQueryParam('step');

    // Pre-fill the Student ID from the email link, so it is never retyped —
    // by far the easiest place for a student to make a typo.
    const prefillId = (Router.getQueryParam('id') || '').trim();
    if (prefillId) {
      const regIdField = Utils.qs('#reg-student-id');
      const loginIdField = Utils.qs('#login-student-id');
      const forgotIdField = Utils.qs('#forgot-student-id');
      if (regIdField) regIdField.value = prefillId;
      if (loginIdField) loginIdField.value = prefillId;
      if (forgotIdField) forgotIdField.value = prefillId;
    }

    Router.showStep(
      ALLOWED_ENTRY_STEPS.indexOf(requestedStep) !== -1 ? requestedStep : 'login'
    );
  }

  return { initLoginPage };
})();
