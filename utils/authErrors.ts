export function getSignUpPasswordError(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include an uppercase letter';
  }
  if (!/[^A-Za-z]/.test(password)) {
    return 'Password must include a number or symbol (non-letter)';
  }
  return null;
}

export function getAuthErrorMessage(
  error: unknown,
  mode: 'login' | 'signup',
): string {
  const code: string | undefined =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : undefined;

  switch (code) {
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'That password is too weak. Please choose a stronger one.';
    case 'auth/missing-password':
      return 'Please enter your password.';
    case 'auth/missing-email':
      return 'Please enter your email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'The email or password you entered is incorrect.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Email sign-in is currently disabled. Please try another method.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled. Please try again.';
  }

  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  if (message) return message;

  return mode === 'login'
    ? 'Could not sign in. Please try again.'
    : 'Could not create your account. Please try again.';
}
