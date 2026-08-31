'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedStatuses = new Set(['active', 'paused']);

export async function setFamilyStatus(formData: FormData) {
  const familyId = formData.get('family_id');
  const status = formData.get('status');

  if (typeof familyId !== 'string' || !uuidPattern.test(familyId)
      || typeof status !== 'string' || !allowedStatuses.has(status)) {
    redirect('/platform?error=invalid_request');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase.rpc('after_platform_admin_set_family_status', {
    p_family_id: familyId,
    p_status: status,
  });
  if (error) redirect('/platform?error=update_failed');

  revalidatePath('/platform');
  redirect(`/platform?updated=${status}`);
}
