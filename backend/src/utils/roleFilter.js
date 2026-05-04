export const buildRoleFilter = (user) => {
  const { userId, role } = user;
  switch (role) {
    case "agent":
      return {
        where: `(t.assigned_to = ? OR (t.assigned_to IS NULL AND t.queue_id IN (
                    SELECT queue_id FROM queue_agents WHERE user_id = ?)))`,
        params: [userId, userId]
      };
    case "tl":
      return {
        where: `(t.assigned_to = ? OR t.assigned_to IN (
                    SELECT id FROM users WHERE reporting_to = ?))`,
        params: [userId, userId]
      };
    case "manager":
      return {
        where: `(t.assigned_to IN (
                    SELECT id FROM users WHERE reporting_to = ?
                    OR reporting_to IN (SELECT id FROM users WHERE reporting_to = ?)))`,
        params: [userId, userId]
      };
    case "gm":
      return {
        where: `(t.assigned_to IN (
                    SELECT id FROM users
                    WHERE reporting_to IN (
                        SELECT id FROM users WHERE reporting_to = ?)))`,
        params: [userId]
      };
    case "superadmin":
      return { where: "1=1", params: [] };
    default:
      return { where: "t.assigned_to = ?", params: [userId] };
  }
};
