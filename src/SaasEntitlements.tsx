import { useEffect, useState } from 'react';
import type { CompanyWrite } from './saasAdminModel';
import { choosePlan, setOverride, expiryUtcForInput, type EntitlementCatalog, type Subscription } from './saasEntitlementsModel';
export default function SaasEntitlements({value, onChange, disabled = false}: {value: CompanyWrite; onChange: (subscription: Subscription)=>void; disabled?: boolean}) {
  const sub = value.subscription;
  const [catalog, setCatalog] = useState<EntitlementCatalog | null>(null);
  const [error, setError] = useState('');
  const [attempt, retry] = useState(0);
  useEffect(()=> {
    const controller = new AbortController();
    fetch('/api/saas-admin/entitlements/catalog', {credentials:'same-origin', signal:controller.signal})
      .then(async response=> {if(!response.ok) throw new Error('Не удалось загрузить планы'); return response.json() as Promise<EntitlementCatalog>;})
      .then(data=> {setCatalog(data); setError('');})
      .catch(err=> {if(!controller.signal.aborted) setError(err.message);});
    return ()=>controller.abort();
  }, [attempt]);
  return <section aria-label="Подписка и возможности">
    <h3>Подписка</h3>
    {error && <p role="alert">{error} <button type="button" onClick={()=>retry(attempt+1)}>Повторить</button></p>}
    <label className="sa-field">План
      <select disabled={disabled || !catalog} value={sub.policy === 'plans_v1' ? sub.plan_id || '' : 'legacy'} onChange={e=>onChange(choosePlan(sub,e.target.value))}>
        {sub.policy !== 'plans_v1' && <option value="legacy">Прежние условия · {sub.plan || 'индивидуальный доступ'}</option>}
        {catalog?.plans.map(plan=><option key={plan.id} value={plan.id}>{plan.label}</option>)}
      </select>
    </label>
    {sub.policy !== 'plans_v1' && <p className="sa-hint">Прежний доступ сохранён. Выбор нового плана включает проверку подписки и возможностей.</p>}
    <div className="sa-form-grid">
      <label className="sa-field">Состояние<select disabled={disabled} value={sub.status || 'active'} onChange={e=>onChange({...sub,status:e.target.value as Subscription['status']})}>
        <option value="active">Активна</option><option value="suspended">Приостановлена</option><option value="cancelled">Отменена</option>
      </select></label>
      <label className="sa-field">Часовой пояс<input disabled={disabled} value={sub.timezone || 'Europe/Simferopol'} onChange={e=>onChange({...sub,timezone:e.target.value})}/></label>
      {(['start_date','end_date'] as const).map((key,i)=><label className="sa-field" key={key}>{i ? 'Дата окончания (включительно)' : 'Дата начала'}<input disabled={disabled} type="date" value={sub[key] || ''} onChange={e=>onChange({...sub,[key]:e.target.value || null})}/></label>)}
    </div>
    <p className="sa-hint">По окончании подписки новые операции закрываются. История и завершение уже начатых отправок и оплат сохраняются в пределах прав сотрудника и складов.</p>
    {sub.policy === 'plans_v1' && <details><summary>Индивидуальные возможности</summary>
      <p className="sa-hint">Исключения изменяют состав плана. Отключённый модуль остаётся закрыт; права сотрудника не расширяются.</p>
      {catalog?.features.map(feature=> {
        const override = sub.overrides?.[feature.id];
        return <div key={feature.id} className="sa-form-grid">
          <label className="sa-field">{feature.label}<select disabled={disabled} value={override?.mode || 'inherit'} onChange={e=>onChange(setOverride(sub,feature.id,e.target.value as 'inherit'|'allow'|'deny',override?.expires_at || null))}>
            <option value="inherit">По плану</option><option value="allow">Разрешить</option><option value="deny">Запретить</option>
          </select></label>
          {override && override.mode !== 'inherit' && <label className="sa-field">Срок исключения (UTC)<input disabled={disabled} type="datetime-local" value={expiryUtcForInput(override.expires_at)} onChange={e=>onChange(setOverride(sub,feature.id,override.mode,e.target.value ? e.target.value+':00Z' : null))}/></label>}
        </div>;
      })}
    </details>}
  </section>;
}
