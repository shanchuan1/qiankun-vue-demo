<template>
  <div ref="about" class="about">
    <h1>This is parent about page</h1>
    <!-- <button @click="handleClick">点击卸载被loadMicroApp手动加载的子应用</button> -->
    <button @click="handleClick">点击卸载子应用共享的组件</button>
    <div ref="share" id="share"></div>
  </div>
</template>

<script>
  export default {
    data(){
      return {
        vueInstance:null
      }
    },
  mounted() {
    console.log('window.proxy?.shareComp', window.proxy?.shareComp);
    /* 子应用挂载完之后调用 */
    window.addEventListener('single-spa:first-mount',(e) => {
      this.mountEl()
    }) 
    /* 更新后调用 */
    this.mountEl()
  },
  methods: {
    mountEl(){
      /* 尽支持子应用是手动加载的方式loadMicroApp，才能共享组件 */
      this.vueInstance = window.proxy?.shareComp('#share')
      
    },
    handleClick(){
      // window.loadAppInstance.unmount()
      console.log('🚀 ~ handleClick ~ this.vueInstance:', this.vueInstance)
      this.vueInstance.$destroy() //调用只会销毁组件实例，但不会从 DOM 结构中移除组件的元素。

       // 从 DOM 结构中移除组件的元素
      //  this.$refs.share.removeSelf()
      // const share = this.$refs?.share.$el; // ref在shareComp挂载的时候会移除
      // const share = document.querySelector('.shareA'); // 直接获取dom
      // const share = document.querySelector(`.${this.vueInstance.$el._prevClass}`);
      const share = this.vueInstance.$el;
      console.log('share', share)
      const about = this.$refs.about;
      console.log('about', about)
      about.removeChild(share);
    }
  },
}
</script>
<style scoped>
h1{
  color: green;
}
</style>