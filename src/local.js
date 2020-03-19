console.log(ipcRenderer.sendSync('synchronous-message', 'ping'));

function selectItem(){
  $(".flex.list ul li").removeClass("selected");
  $(this).addClass("selected");
}

let convos = ipcRenderer.sendSync('get-convos');
convos.forEach((item, i) => {
  let template = $("#convo").html().trim();
  let clone = $(template);

  clone.find(".title").text(item.num);
  clone.find(".desc").text(item.msg);
  clone.find(".dt").text(item.date);
  if (i == 0) clone.addClass('selected');

  clone.on("click", selectItem);

  $(".list ul").append(clone);
});
