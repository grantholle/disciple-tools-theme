jQuery(document).ready(function($){$("#post-comment-form").on("submit",function(e){e.preventDefault();var o=$("#post-comment-content").val(),t=$("#post-comment-id").val(),n="publish",c={content:o,post:t,status:"publish"};$.ajax({method:"POST",url:POST_SUBMITTER.root+"wp/v2/comments",data:c,beforeSend:function(e){e.setRequestHeader("X-WP-Nonce",POST_SUBMITTER.nonce)},success:function(e){console.log(e),alert(POST_SUBMITTER.success)},fail:function(e){console.log(e),alert(POST_SUBMITTER.failure)}})})});