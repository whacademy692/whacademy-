/**
 * auth.js — W.H. Academy
 * Drives login.html's multi-step flow: Login, Forgot PIN, OTP
 * Verification, Registration. Talks to the backend exclusively through
 * api.js, matching the exact operation names Auth.gs/OTP.gs/Registration.gs expose.
 */

const Auth = (() => {

  // pendingPin: the PIN the student has chosen but which is NOT yet committed.
  // It is held in memory ONLY, never stored, and is sent to the backend just once
  // — after OTP.verify() has succeeded. registration/complete refuses to run
  // without a verified OTP (Registration.completeAccountCreation), so the reordered
  // "PIN first, code second" flow is exactly as safe as the old one.
  let registrationContext = { studentId: null, purpose: null, pendingPin: null };

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
      // Same order as the Google Form path: choose the PIN first, code second.
      registrationContext = { studentId, purpose: 'Registration', pendingPin: null };
      Router.showStep('set-pin');
    } catch (err) {
      Notifications.error(err.message || 'Registration could not be started. Please check your details.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  // ---- OTP boxes: paste-to-fill ----------------------------------------
  // The boxes are typed one digit at a time, which is fine when you are reading
  // the code off a phone — but everyone copies it from the email instead. Pasting
  // used to dump all 6 digits into whichever box was focused. Now: paste into ANY
  // box and the code lays itself out across all of them.
  //
  // Nothing is ever auto-filled without an explicit paste — no clipboard reading,
  // no guessing. And a paste always CLEARS whatever was there first, so pasting a
  // fresh code over a stale one just works instead of mixing the two.

  function otpBoxes() { return Utils.qsa('.otp-box'); }

  function syncOtpHidden() {
    const hidden = Utils.qs('#otp-code-hidden');
    if (hidden) hidden.value = otpBoxes().map((b) => b.value).join('');
  }

  function clearOtpBoxes() {
    otpBoxes().forEach((b) => { b.value = ''; });
    syncOtpHidden();
  }

  /** Spreads a pasted string across the boxes. Non-digits are stripped. */
  function fillOtpBoxes(rawText) {
    const digits = String(rawText || '').replace(/\D/g, '');
    if (!digits) return false;

    const boxes = otpBoxes();
    boxes.forEach((box, i) => { box.value = digits[i] || ''; });   // clears leftovers
    syncOtpHidden();

    const nextEmpty = boxes.findIndex((b) => !b.value);
    (nextEmpty === -1 ? boxes[boxes.length - 1] : boxes[nextEmpty]).focus();
    return true;
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

      if (registrationContext.purpose === 'PasswordReset') {
        Notifications.success('Verified.');
        Router.showStep('set-new-pin');
        return;
      }

      // Registration: the PIN was already chosen on the previous screen and has
      // been waiting in memory. The code is verified, so commit it now.
      await Api.registration.complete(
        registrationContext.studentId,
        registrationContext.pendingPin,
        registrationContext.pendingPin
      );
      registrationContext.pendingPin = null;
      Notifications.success('Your account is ready. Please log in.');
      clearOtpBoxes();
      Router.showStep('login');
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
      // Hold the PIN in memory and ask for the code NOW — this is the moment the
      // student actually needs it. (It used to be fired the instant the Google Form
      // was submitted, so a code turned up before they had chosen anything.)
      registrationContext.pendingPin = pin;
      await Api.otp.request(registrationContext.studentId, '', '', 'Registration');
      Notifications.success('A 6-digit code was sent to your email. Enter it to finish.');
      clearOtpBoxes();
      Router.showStep('otp-verification');
    } catch (err) {
      registrationContext.pendingPin = null;
      Notifications.error(err.message || 'Could not send your verification code.');
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
    const boxes = otpBoxes();
    if (boxes.length) {
      boxes.forEach((box, index) => {

        // Paste into ANY box -> the whole code spreads across all of them.
        box.addEventListener('paste', (e) => {
          const text = (e.clipboardData || window.clipboardData).getData('text');
          if (fillOtpBoxes(text)) e.preventDefault();
        });

        box.addEventListener('input', () => {
          // Some Android keyboards deliver a paste as a plain multi-character
          // input rather than a paste event — handle that shape too.
          if (box.value.length > 1) {
            fillOtpBoxes(box.value);
            return;
          }
          if (box.value && index < boxes.length - 1) boxes[index + 1].focus();
          syncOtpHidden();
        });

        box.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !box.value && index > 0) boxes[index - 1].focus();
        });

        // Tapping a box selects what is in it, so typing over it replaces it.
        box.addEventListener('focus', () => box.select());
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

    } else if (requestedStep === 'set-pin' && prefillId) {
      // Arriving from the "Create Your PIN" email, after the Google Form.
      // Safe: choosing a PIN here commits nothing. It is held in memory, and the
      // code that unlocks it is emailed ONLY to the address on file for this
      // Student ID (Registration.verifyIdentityForOtp). registration/complete
      // still refuses to run without a verified OTP.
      registrationContext = { studentId: prefillId, purpose: 'Registration', pendingPin: null };
      entryStep = 'set-pin';

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

    // 'set-new-pin' (password reset) is deliberately NOT reachable from a URL:
    // it must only ever be entered after OTP.verify() has actually succeeded.
    Router.showStep(entryStep);
  }

  return { initLoginPage };
})();
