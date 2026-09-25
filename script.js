const messages=[['Model A','Proposer','Here’s my idea for the plan...','10:24 AM'],['Model B','Critic','Good point, but I think we should also consider...','10:25 AM'],['Model A','Proposer','I agree. Let’s add that to the plan...','10:26 AM'],['Human','Moderator','That sounds good. Keep going.','10:27 AM']];

function renderMessages(target){
    target.innerHTML=messages.map(([name,role,text,time])=>
        `<div class="message">
            <div class="avatar">${name[0]}</div>
            <div>
                <strong>${name} 
                    <small style="display:inline">(${role})</small>
                </strong>
                <p>${text}</p>
            </div><span class="time">${time}</span>
        </div>`).join('')
}

renderMessages(document.querySelector('#messages'));
renderMessages(document.querySelector('#review-messages'));
document.querySelectorAll('[data-nav]').forEach(button=>
    button.addEventListener('click',()=>
        show(button.dataset.nav==='home'?'setup':button.dataset.nav==='runs'?'review':'setup')));

function show(name){
    document.querySelectorAll('.screen').forEach(s=>
        s.classList.remove('active')
    );
    document.querySelector(`#${name}-screen`).classList.add('active');
    window.scrollTo(0,0)
}

document.querySelector('#start-run').addEventListener('click',()=>
    show('conversation')
);

document.querySelector('#send-message').addEventListener('click',()=>{
    const input=document.querySelector('#message-input');
        if(!input.value.trim())
            return;
        messages.push(['Human','Moderator',input.value.trim(),'now']);
        renderMessages(document.querySelector('#messages'));
        input.value=''
    });

    document.querySelector('#save-local').addEventListener('click',()=>
    alert('Run saved locally.')
);

document.querySelector('#export-json').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({mode:'Cooperative Task',messages},null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='vellum-run.json';a.click();
    URL.revokeObjectURL(a.href)}
);

document.querySelector('#delete-run').addEventListener('click',()=>{
    if(confirm('Delete this run?'))
        show('setup')
    });
