

$('.mobile-show.image-slider').each(function(){
  $(this).slick({
      // autoplay:true,
      arrows: true,
      draggable: true,
      drag: true,
      dots: true,    //       infinite: true,
      speed: 200,
      slidesToShow: 1,
  });
})

$(document).on('click','.size-popup-button',function(){
  $('#shopify-section-header-inline').addClass('layout-lower');
  $('.favourite-icon').addClass('layout-lower');
  $('#size-guide').addClass('is_open');
  $('html, body').addClass('no-scroll')
})
$(document).on('click','.size-popup-close',function(){
  $('#shopify-section-header-inline').removeClass('layout-lower');
  $('.favourite-icon').removeClass('layout-lower');
  $('#size-guide').removeClass('is_open');
  $('html, body').removeClass('no-scroll')
})
$(document).on('click','.mobile-show.desc-heading',function(e){
  $(e.target).toggleClass('is_open');
  $(e.target).next().slideToggle();
})
$(document).on('click','[slider-item]',function(e){
  
  if(!$(e.target).hasClass('.slide-dot')){
    window.location.href = $(e.target).parents('.mobile-show').find('.is--href-replaced').attr('href');
  }
})