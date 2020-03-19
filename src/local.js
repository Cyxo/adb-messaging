console.log(ipcRenderer.sendSync('synchronous-message', 'ping'));

function selectItem(){
  $(".flex.list ul li").removeClass("selected");
  $(this).addClass("selected");
  getSMS($(this).attr('id'));
}

function getConvos(){
  let convos = ipcRenderer.sendSync('get-convos');
  convos.forEach((item, i) => {
    let template = $("#convo").html().trim();
    let clone = $(template);

    clone.attr('id', item.addr);
    clone.find(".title").text(item.num);
    clone.find(".desc").text(item.msg);
    clone.find(".dt").text(item.date);
    if (i == 0) clone.addClass('selected');

    clone.on("click", selectItem);

    $(".list ul").append(clone);
  });
  return convos;
}
let convos = getConvos();

function getSMS(addr){
  $(".messages ul").html("");
  let sms = ipcRenderer.sendSync('get-messages', {address: addr});
  sms.forEach((item) => {
    let msg = $('<li class="message"></li>');
    msg.text(item.msg);
    if (item.sent) msg.addClass("sent");
    $(".messages ul").prepend(msg);
  });
  $(".messages").scrollTop($(".messages ul").height());
}
getSMS(convos[0].addr);
