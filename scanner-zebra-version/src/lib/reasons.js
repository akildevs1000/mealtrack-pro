const MAP = {
  not_registered: 'Not Registered',
  inactive: 'Account Inactive',
  outside_allowed_time: 'Outside Allowed Time',
  already_received: 'Already Received Meal',
  invalid_qr: 'Invalid QR Code',
  wrong_site: 'Wrong Site',
  expired: 'ID Expired',
  // mealtrack-pro reason codes
  unknown_employee: 'Not Registered',
  employee_inactive: 'Account Inactive',
  meal_ineligible: 'Not Eligible For Meals',
  already_breakfast: 'Already Had Breakfast',
  already_lunch: 'Already Had Lunch',
  already_dinner: 'Already Had Dinner',
  outside_meal_window: 'Outside Meal Window',
  device_not_registered: 'Device Not Registered',
  network: 'Network Error',
}

export function reasonLabel(reason) {
  if (!reason) return ''
  return MAP[reason] || 'Denied'
}
