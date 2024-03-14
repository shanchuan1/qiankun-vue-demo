<template>
    <div class="shareA">
      <h1>我是被主子应用之间共享的组件A</h1>
    </div>
</template>
  
<script>
  export default {
    name: 'ShareA',
  }
</script>
  
<style scoped>
.shareA {
    h1 {
        color: blue
    }
}
</style>
