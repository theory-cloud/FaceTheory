export function usePermissions() {
  return {
    merchantUid: 'merchant',
    partner: 'partner',
    filterArrayByPermissions: <T>(items: T[]) => items,
    hasPermission: () => true,
  };
}

