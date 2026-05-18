import { getDeal } from '../ui/form.js';
import { getSupabaseClient } from './supabase.js';

function normalize(value, fallback = 'our_spn') {
  return ['our_spn', 'external_agency', 'client_self', 'unknown'].includes(value) ? value : fallback;
}

async function saveCooperationColumns(dealId) {
  if (!dealId) return;
  const deal = getDeal();
  const supabase = await getSupabaseClient();
  if (!supabase) return;

  const patch = {
    representation_model: deal.representationModel || 'both_sides_two_spn',
    seller_representation: normalize(deal.sellerRepresentation),
    buyer_representation: normalize(deal.buyerRepresentation),
    seller_partner_name: deal.sellerPartnerName || null,
    buyer_partner_name: deal.buyerPartnerName || null,
    team_comment: deal.teamComment || null
  };

  const { error } = await supabase
    .from('nav_deals')
    .update(patch)
    .eq('id', dealId);

  if (error) console.warn('Не удалось сохранить формат сделки:', error.message);
}

window.addEventListener('navigatorDealSaved', (event) => {
  saveCooperationColumns(event.detail?.id).catch((error) => console.warn(error));
});
